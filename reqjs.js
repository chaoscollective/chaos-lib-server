// RequireJS tools (reqjs)
// makes optimizations and auto-updating of modular code simple.
var myname = "reqjs: ";
// --
var requirejs = require("requirejs");
var fs        = require("fs");
var exec      = require('child_process').exec;
// --
module.exports = function(settings){
  var exports   = {};
  var reqjs_opt = exports;
  // --
  if(!settings) return log9(myname+"No settings object?");
  // --
  var baseUrl = settings.baseUrl || "/NETFS/ChaosLibClient/jsmods";
  // --
  var pathToR = __dirname+"/node_modules/requirejs/bin/r.js";
  exports.optimize = function(name, absMainJSDir, autoUpdate){
    var rConfig = '-o baseUrl='+baseUrl+' ';
    rConfig += 'paths.'+name+'='+absMainJSDir+'/'+name+' ';
    rConfig += 'name='+name+' '; 
    rConfig += 'out='+absMainJSDir+'/'+name+'_opt.js';
    //console.log(pathToR+' '+rConfig);
    var updates = 0;
    function doOptimization(){
      exec('node '+pathToR+' '+rConfig, { 
          encoding:   'utf8', 
          timeout:    30000, 
          maxBuffer:  200*1024, 
          killSignal: 'SIGTERM',
          env: {},
          cwd: __dirname, 
        }, 
        function (error, stdout, stderr) {
          if(error){
            if(updates === 0){
              console.log(myname+'exec error: ');
              console.log(stdout);
              console.log(error);
            } 
            return;
          }
          if(updates === 0) console.log(myname+"optimized, "+name+".js --> "+name+"_opt.js");
          // add autoUpdater? :)
          if(updates === 0 && autoUpdate){
            var fname = absMainJSDir+'/'+name+".js";
            console.log(myname+"(+) adding auto-update for "+name+".js");
            fs.watchFile(fname, function (curr, prev) {
              if(prev.size.toString() !== curr.size.toString()){
                doOptimization();
              }
            });
          }
          updates++;
        }
      );
    }
    doOptimization();
  };
  // --
  return exports;
};
