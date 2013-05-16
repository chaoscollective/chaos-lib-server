var myname      = "kernel_sessions: ";
// --
var connectMongo = require('connect-mongo');
// --
module.exports = function(settings, app, express){ 
  // --
  if(!settings) return console.log(myname+"ERROR, no settings");
  if(!settings.session_secret) return console.log(myname+"ERROR, no settings.session_secret");
  if(!settings.session_key   ) return console.log(myname+"ERROR, no settings.session_key");
  if(!settings.session_domain) return console.log(myname+"ERROR, no settings.session_domain");
  // -- 
  var MONGO_HOST        = settings.mongo_host     ||  "127.0.0.1";
  var MONGO_PORT        = settings.mongo_port     ||  27017;
  var MONGO_USER        = settings.mongo_user     ||  "KernelUser"; 
  var MONGO_PASS        = settings.mongo_pass     ||  "KernelPass1234";
  var MONGO_DBNAME      = settings.mongo_dbname   ||  "Chaos"; 
  var MONGO_COLLECTION  = settings.mongo_collection ||"Sessions"; 
  // --
  var SESSION_SECRET    = settings.session_secret ||  "somethingSuperSecret"; 
  var SESSION_KEY       = settings.session_key    ||  "chaos_sid"; 
  var SESSION_DOMAIN    = settings.session_domain ||  ".example.com";
  // --
  var MongoStore        = connectMongo(express);
  var sessionStore      = new MongoStore({
    db:         MONGO_DBNAME,
    collection: MONGO_COLLECTION,
    host:       MONGO_HOST,
    post:       MONGO_PORT,
    username:   MONGO_USER,
    password:   MONGO_PASS,
    auto_reconnect: true,
    clear_interval: 60*60 // time in seconds to clear expired sessions
  }, function(db){
    if(!db){
      return console.log(myname+"ERROR setting up db."); 
    } 
    console.log(myname+"ready."); 
  });
  // --
  var sessionMiddleware = express.session({  
    key: SESSION_KEY, 
    secret: SESSION_SECRET, 
    store: sessionStore,
    cookie: { 
      path     : '/',  // root path for the cookie
      httpOnly : true, // this includes https (just not browser code)
      maxAge   : 1000*60*60*24*100, //100 days between accesses
      //secure   : true  
      //domain   : ".chaoscollective.org" // allow subdomain (maybe userful later)
    } 
  });
  // --
  app.use(function(req, res, next){
    // if user doesn't have cookies and request is for non-cookie items (i.e., javascript.map)
    if(!req.cookies[SESSION_KEY] && req.url.indexOf(".map") > 0){
      //console.log("no session support for .map");
      req.session = {};
      return next();
    }else{
      return sessionMiddleware(req, res, next);
    }
  }); 
  // --
  return sessionStore;
};
