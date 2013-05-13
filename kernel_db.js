var myname      = "kernel_db: ";
// --   
module.exports = function(settings){
var exports     = {};
var kernel_db   = exports;
var logHelp     = require("./log.js");
var _           = require("underscore");
// --
if(!settings) log9(myname+"No settings object?");
// ----------------------------
// IMPORTANT APP-SPECIFIC VARS.
var MONGO_HOST    = settings.mongo_host   || "127.0.0.1";
var MONGO_PORT    = settings.mongo_port   || 27017;
var MONGO_USER    = settings.mongo_user   || "KernelUser";
var MONGO_PASS    = settings.mongo_pass   || "Password1234";
var MONGO_DBNAME  = settings.mongo_dbname || "Chaos"; 
// --
var dbCollections = {
  Users: null,
  Sessions: null,
  Projects: null
};
// ----------------------------

var MAX_QUERY_RESULTS                   = 100; // >= 2
var MAX_QUERY_LOOP_COUNT                = 100;
var ENABLE_DB_PROFILING                 = false;
var UPDATE_DB_INDEXES_AFTER_CONNECTION  = false; // only need to do this once.
var DB_PROFILING_PRFILE                 = 1;
var DB_PROFILING_SLOW_MS                = 50;

// -- MongoDB!
var mongo         = require("mongodb");
var Db            = mongo.Db;
var Server        = mongo.Server;
// --
var dbServer      = new Server(MONGO_HOST, MONGO_PORT, {auto_reconnect: true});
var dbDB          = new Db(MONGO_DBNAME, dbServer, {native_parser:false, safe:true});
// --
var dbRoot        = ""; // root database
var dbReady       = false;
var dbReadyCb     = null;
// --
dbDB.open(function(err, db) {
  if(err) return logErr(err, myname+"could not open db");
  dbRoot = db;
  db.authenticate(MONGO_USER, MONGO_PASS, function(err, dbauth){
    if(err) return logErr(err, myname+"could not authenticate with db");
    // --
    if(ENABLE_DB_PROFILING){
      db.command({
        profile: DB_PROFILING_PRFILE, 
        slowms : DB_PROFILING_SLOW_MS
      }, function(err){
        if(err) return logErr(myname+"Unable to setup Db profiling.");
        if(DB_PROFILING_PRFILE > 0){
          log2(myname+"Db profiling enabled.");
        }else{
          log2(myname+"profiling disabled.");
        } 
      });
    }
    // --
    var total = _.size(dbCollections);
    var sofar = 0;
    _.each(dbCollections, function(val, key){
      db.collection(key, function(err, collection){
        if(err) return logErr(err, myname+"could not open collection: "+key);
        dbCollections[key] = collection;
        //console.log(myname+"opened db collection: "+key);
        sofar++;
        if(sofar === total){
          console.log(myname+"all collections ready.");
          if(UPDATE_DB_INDEXES_AFTER_CONNECTION){
            createDBObjectIndexes();
          }
          dbReady = true;
          if(dbReadyCb){
            dbReadyCb();
          }
        }
      });  
    });
  });
});
exports.ready = function(cb){
  dbReadyCb = cb;
  if(dbReady) return cb();
};
// --
function queryDB(dbObj, query, fields, skip, limit, orderby, callback){ 
  limit   = Math.max(0, Math.min(limit, MAX_QUERY_RESULTS));
  orderby = orderby||{_id: -1}; 
  var q2  = {$query: query, $orderby: orderby};
  dbObj.find(q2, fields||{}, skip, limit, function (err, cursor) {
    if(err){
      return callback("query failed.");
    }
    // cursor.count(function(err,count){
    //   console.log("err?", err);
    //   console.log("count?", count);
    // }); 
    cursor.toArray(function(err, docs) {
      return callback(err, docs);
    });
  });
}
function queryDBAndIterate(dbObj, query, fields, skip, limit, orderby, callback){
  var loopCount = 0;
  limit = limit||0;
  skip  = skip ||0;
  function fetch(){ 
    if(limit && skip >= limit) return callback(null, null);
    queryDB(dbObj, query, fields, skip, 2, orderby, function(err, docs){ 
      if(err || !docs) return logErrCB(err, cb);
      skip++;
      if(docs.length > 0){
        callback(null, docs[0], fetch);
      }else{
        callback(null, null);
      }
    });
  }
  fetch();
}
function countDB(dbObj, query, callback){ 
  dbObj.count(query, function (err, info) {
    if(err){
      return callback("count failed.");
    }
    return callback(null, info);
  });
} 
function distinctDB(dbObj, distinct, query, sortby, sortdir, maxormin, skip, limit, callback){ 
  limit = Math.max(0, Math.min(limit, MAX_QUERY_RESULTS));
  var grp = {_id: "$"+distinct};
  grp["max_"+sortby] = {$max: "$"+sortby};
  grp["min_"+sortby] = {$min: "$"+sortby};
  var srt = {};
  srt[maxormin+"_"+sortby] = sortdir;
  dbObj.aggregate([
    {$match: query},
    {$group : grp},
    {$sort: srt},
    {$skip: skip},
    {$limit: limit}
  ], function(err, result) {
    if(err) logErr(err, "db aggregation error");
    callback(err, result);
  });
}
// ----------------------------
// Common names + app-specific
// ----------------------------
function createDBObjectIndexes(){
  console.log(myname+"ensuring db index...");
  /*
  dbCollections.SessionEvents.ensureIndex('_session', {safe:true}, function(err, indexName) {
   if(err) logErr(err, myname+"unable to update object index.");
   log1(myname+"(+) index "+indexName);
  }); 
  dbCollections.SessionInfo.ensureIndex('_urlname', {safe:true}, function(err, indexName) {
   if(err) logErr(err, myname+"unable to update object index.");
   log1(myname+"(+) index "+indexName);
  }); 
  */
}
// ----------------------------
// app-specific.
// ----------------------------
var _projects_safeFieldsToReturn = {_id:1, desc:1, _ct:1, stage:1, pts:1, port:1};
// --
exports.projects_add                  = function(desc, cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  if(!desc)     return logErrCB(myname+"no desc.", cb);
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  // --
  var pInfo     = {};
  pInfo.desc    = desc;
  pInfo.stage   = "proposed";
  pInfo.pts     = 0;
  pInfo.pts_ips = [];
  pInfo._ct     = now;
  pInfo._mt     = now;
  
    // --
  dbObj.save(pInfo, {safe: true}, function(err, result){
    if(err) return logErrCB("Could not save new project doc!", cb);
    // --
    log3("New project idea added.");
    return cb(null, result);
  });
};
exports.projects_getByID              = function(projID, cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  if(!projID) return cb(myname+"no projID.");
  // --
  var dbObj = dbCollections.Projects; 
  projID    = projID+"";
  // --
  dbObj.findOne({_id: mongo.ObjectID(projID)}, _projects_safeFieldsToReturn, function (err, doc) {
    if(err) return logErrCB("error reading from db.", cb);
    if(doc === null){
      return cb("No doc found.");
    }else{
      return cb(null, doc);
    } 
  });
};
exports.projects_updateDesc           = function(projID, desc, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  var now = new Date().getTime();
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {"desc": desc, "_mt": now}}, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
exports.projects_upPoints             = function(projID, ip, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  var now = new Date().getTime();
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    var update = {$inc: {pts: 1}};
    var query  = {_id: mongo.ObjectID(projID)};
    if(ip){
      update["$addToSet"] = {"pts_ips": ip};
      query["pts_ips"]    = {$ne: ip}; 
    }
    dbObj.update(query, update, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
exports.projects_dnPoints             = function(projID, ip, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  var now = new Date().getTime();
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    var update = {$inc: {pts: -1}};
    if(ip){
      var ips = pInfo.pts_ips||[];
      for(var i=0; i<ips.length; i++){
        if(ips[i] === ip) return logErrCB("already voted", cb);
      }
      update.$addToSet = {pts_ips: ip};
    }
    dbObj.update({_id: mongo.ObjectID(projID)}, update, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
// --
exports.projects_getActive            = function(recentToGet, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  // -- 
  queryDB(dbObj, {stage: "active"}, _projects_safeFieldsToReturn, 0, recentToGet, {_mt: -1}, function(err, docs){ 
    if(err) return logErrCB(err, cb);
    // --
    return cb(null, docs);
  });
};
exports.projects_getAllLatest         = function(recentToGet, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  // --  
  queryDB(dbObj, {}, _projects_safeFieldsToReturn, 0, recentToGet, {_ct: -1}, function(err, docs){ 
    if(err) return logErrCB(err, cb);
    // --
    return cb(null, docs);
  });
};
exports.projects_getProposedHiScore   = function(recentToGet, includeActive, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  // --
  var q = {stage: {$in: ["proposed","developing"]}};
  if(includeActive){
    q.stage.$in.push("active");
  }
  // -- 
  queryDB(dbObj, q, _projects_safeFieldsToReturn, 0, recentToGet, {stage:1, pts: -1, _ct: -1}, function(err, docs){ 
    if(err) return logErrCB(err, cb);
    // --
    return cb(null, docs);
  });
};
exports.projects_getArchivedRecently  = function(recentToGet, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  // --  
  queryDB(dbObj, {stage: "archived"}, _projects_safeFieldsToReturn, 0, recentToGet, {_mt: -1}, function(err, docs){
    if(err) return logErrCB(err, cb);
    // --
    return cb(null, docs);
  });
};
// --
exports.projects_getProposedDevCount  = function(cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects;
  // --
  var q = {stage: {$in: ["proposed","developing"]}};
  // -- 
  countDB(dbObj, q, cb); 
};
exports.projects_searchForName        = function(name, cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  if(!name)     return logErrCB(myname+"no name.", cb);
  // --
  var dbObj   = dbCollections.Projects;
  name = name+"";
  // --
  var regexpName  = new RegExp("^"+name, "i");
  var R           = 8;
  var retFields   = _projects_safeFieldsToReturn; 
  var retSort     = {desc: -1};
  queryDB(dbObj, {$or: [
    {desc:    regexpName}
  ]}, retFields, 0, R, retSort, function(err, results){
    if(err) return cb(err);
    if(results.length >= R) return cb(err, results);
    // --
    var firstHitIDs = []; 
    for(var i=0; i<results.length; i++) firstHitIDs.push(results[i]._id);
    // secondary search, we didn't see any results. loosen it up.
    var regexpName2 = new RegExp(" "+name, "i");
    queryDB(dbObj, {$or: [
      {desc:    regexpName2},
    ],
    _id: {$not: {$in: firstHitIDs}}}, retFields, 0, R-results.length, retSort, function(err, res2){
      if(err) return cb(null, results);
      results = results.concat(res2);
      if(results.length >= R) return cb(null, results);
      // --
      for(var i=0; i<res2.length; i++) firstHitIDs.push(res2[i]._id);
      // -- 
       var regexpName3 = new RegExp(name, "i");
      queryDB(dbObj, {$or: [
        {desc:    regexpName3},
      ],
      _id: {$not: {$in: firstHitIDs}}}, retFields, 0, R-results.length, retSort, function(err, res3){
        if(err) return cb(null, results);
        results = results.concat(res3);
        return cb(null, results);  
      });
    });
  });
};
// --
exports.projects_getHighestUsedPort   = function(cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  // --
  var dbObj = dbCollections.Projects; 
  // --
  queryDB(dbObj, {port: {$exists: 1}}, _projects_safeFieldsToReturn, 0, 1, {port: -1}, function (err, docs) {
    if(err) return logErrCB("error reading from db.", cb);
    if(docs === null || docs.length < 1){
      console.log(myname+"no docs found with port.");
      return cb(err, 4000);
    }else{
      var doc = docs[0];
      console.log("Highest used port: "+doc.port);
      return cb(err, doc.port||4000);
    }  
  });
}; 
// --
exports.projects_updateStageToDeveloping  = function(projID, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  if(!projID) return cb(myname+"no projID.");
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  projID    = projID+"";
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    if(pInfo.stage !== "proposed")    return logErrCB("Wrong initial stage.", cb);
    if(pInfo.stage === "developing")  return logErrCB("Already at that stage.", cb);
    kernel_db.projects_getHighestUsedPort(function(err, port){
      if(err) return logErrCB(err,cb);
      var nextPort = port+1;
      dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {stage: "developing", port: nextPort, "_mt": now}}, {safe:true}, function(err, res){
        if(err) return logErrCB(err, cb);
        log3("Project migrated to: developing");
        kernel_db.projects_getByID(projID, cb);
      });
    });
  });
};
exports.projects_updateStageToActive      = function(projID, cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  if(!projID)   return cb(myname+"no projID.");
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  projID    = projID+"";
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    if(pInfo.stage !== "developing")  return logErrCB("Wrong initial stage.", cb);
    if(pInfo.stage === "active")      return logErrCB("Already at that stage.", cb);
    dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {stage: "active", "_mt": now}}, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      log3("Project migrated to: active");
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
exports.projects_updateStageToArchived    = function(projID, cb){
  if(!dbReady)  return logErrCB(myname+"not ready yet.", cb);
  if(!projID)   return cb(myname+"no projID.");
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  projID    = projID+"";
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    if(pInfo.stage !== "active")    return logErrCB("Wrong initial stage.", cb);
    if(pInfo.stage === "archived")  return logErrCB("Already at that stage.", cb);
    dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {stage: "archived", "_mt": now}}, {safe:true}, function(err, res){ 
      if(err) return logErrCB(err, cb);
      log3("Project migrated to: archived");
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
exports.projects_updateStageToUnarchived  = function(projID, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  if(!projID) return cb(myname+"no projID.");
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  projID    = projID+"";
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    if(pInfo.stage !== "archived")    return logErrCB("Wrong initial stage.", cb);
    if(pInfo.stage === "developing")  return logErrCB("Already at that stage.", cb);
    dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {stage: "developing", "_mt": now}}, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      log3("Project migrated to: unarchived/developing");
      kernel_db.projects_getByID(projID, cb);
    });
  });
};
exports.projects_updateStage              = function(projID, stage, cb){
  if(!dbReady)    return logErrCB(myname+"not ready yet.", cb);
  if(!projID) return cb(myname+"no projID.");
  if(!stage) return cb(myname+"no stage.");
  // --
  var dbObj = dbCollections.Projects;
  var now   = new Date().getTime();
  projID    = projID+"";
  stage     = stage+"";
  if(stage !== "proposed" && stage !== "developing" &&
     stage !== "active" && stage !== "archived"){
       return logErrCB("Invalid stage: "+stage, cb);
     }
  // --  
  kernel_db.projects_getByID(projID, function(err, pInfo){
    if(err) return logErrCB(err,cb);
    dbObj.update({_id: mongo.ObjectID(projID)}, {$set: {stage: stage, "_mt": now}}, {safe:true}, function(err, res){
      if(err) return logErrCB(err, cb);
      log4("Project stage set to: "+stage);
      kernel_db.projects_getByID(projID, cb);
    });
  });
};


// --
return exports;
};





