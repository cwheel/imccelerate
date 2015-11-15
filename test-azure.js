var azure = require('azure-storage');
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

//console.log(config);
var accessKey = config.azure["accessKey"];
var storageAccount = 'imccelerate';
var blobSvc = azure.createBlobService(storageAccount, accessKey);
console.log("test");
blobSvc.createContainerIfNotExists('images',{publicAccessLevel : 'container'} , function(error, result, response){
  if(!error){
    console.log("Success");
    // Container exists and allows
    // anonymous read access to blob
    // content and metadata within this container
  }else{
    console.log(error);
  }
});
blobSvc.createBlockBlobFromLocalFile('images', '2.pdf', '2.pdf', function(error, result, response){
  if(!error){
    // file uploaded
    console.log("Success");
  }
});