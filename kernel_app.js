var myname      = "kernel_app: ";
// -- 
var logHelp     = require("./log.js");
// --
module.exports = function(settings){
var exports = {};
var kapp    = exports;
// --
exports.getClientIp       = function(req) {
  var ipAddress;
  var forwardedIpsStr = req.header('x-forwarded-for'); 
  if(forwardedIpsStr){
    ipAddress = forwardedIpsStr.split(',')[0];
  }
  if(!ipAddress){
    ipAddress = req.connection.remoteAddress;
  }
  return ipAddress;
};
exports.getClientIpBase36 = function(req){
  var ip = _getClientIp(req)||"";
  var ipa = ip.split(".")||[];
  var a = parseInt(ip[0]||0, 10);
  var b = parseInt(ip[0]||0, 10);
  var c = parseInt(ip[0]||0, 10);
  var d = parseInt(ip[0]||0, 10);
  var num = a*256*256*256;
  num += b*256*256;
  num += c*256;
  num += d; 
  return num.toString(36);
};
// --
return exports;
};
