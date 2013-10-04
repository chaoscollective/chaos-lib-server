// LESSr
// makes optimizations and auto-updating of less simple.
var myname = "lessr: ";
// --
var requirejs = require("less");
var fs        = require("fs");
// --
exports.addFile = function(absLessFile, absCSSFile, autoUpdate, options){
  var updates = 0;
  function doOptimization(){
    fs.readFile(absLessDir+"/"+lessFilename, function(err, data){
      if(err) return console.log(err);
      console.log(myname+"processing...");
      // --
      var dataString = (data||"").toString();
      // --
      var parser = new less.Parser(options);
      parser.parse(dataString, function(err, cssTree){
        if(err) return less.writeError(err, options);
        // Create the CSS from the cssTree
        var cssString = cssTree.toCSS({
          compress   : options.compress,
          yuicompress: options.yuicompress
        });
        // Write output
        fs.writeFileSync(absCSSFile, cssString, 'utf8');
        console.log(myname+"Conversion complete.");
      });
      if(updates === 0 && autoUpdate){
        console.log(myname+"adding autoUpdate."); 
        fs.watchFile(absLessFile, function (curr, prev) {
          if(prev.size.toString() !== curr.size.toString()){
            doOptimization();
          }
        });
      }
      updates++;
    });
  }
  doOptimization();
};
