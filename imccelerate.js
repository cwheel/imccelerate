var fs = require('fs');
var lru = require("lru-cache");
var gm = require('gm');
var azure = require('azure-storage');
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var accessKey = config.azure["accessKey"];
var storageAccount = 'imccelerate';
var blobSvc = azure.createBlobService(storageAccount, accessKey);

blobSvc.createContainerIfNotExists('images',{publicAccessLevel : 'container'} , function(error, result, response){
  if(!error){
    console.log("Image Containter Created");
  }else{
    console.log(error);
  }
});

module.exports = function (app, exts, dir) {
	var imgCache = lru();

	app.post('/imccelerate', function(req, res) {
		req.session.width = req.body.width;
		req.session.height = req.body.height;
		req.session.ratio = req.body.ratio;

		res.send("session_stored");
	});

	return function(req, res, next) {
		if (req.originalUrl.indexOf(".") > -1) {
			if (validExt(req.originalUrl, exts)) {
				var path = dir + req.originalUrl;

				if (fileExists(path)) {
					var key = path + req.session.width + req.session.height + req.session.ratio;
					var cacheItem = imgCache.get(key);
					
					if (cacheItem == null) {
						console.log("[imccelerate][cache-miss]", new Date(), req.method, req.originalUrl);

						res.sendFile(path);

						gm(path).size(function(err, image) {
						  	if (err) return handle(err);

						  	var scale = 1;
						  	var quality = 100;
						  	var newHeight;
						  	var newWidth;

						  	if (req.session.width > req.session.height) {
						  		newWidth = ((req.session.width*image.width)/image.height)*scale;
						  		newHeight = (req.session.height)*scale;

						  		quality = 80;
						  	} else {
						  		newHeight = ((req.session.height*image.height)/image.width)*scale;
						  		newWidth = (req.session.width)*scale;

						  		quality = 80;
						  	}

						  	//Manual quality overrides for high DPI screens, ensure that images look sharp
						  	//It's much harder to tell on a low quality screen so scale it pretty low

						  	//Retina
						  	if (req.session.ratio == 2) {
						  		quality = 95;
						  	}
						  	
						  	//Above Retina (5k iMacs and ....)
						  	if (req.session.ratio > 2) {
						  		quality = 98;
						  	}

						  	newWidth = newWidth * req.session.ratio;
						  	newHeight = newHeight * req.session.ratio;
						  	console.log(ext(path, exts))
						  	gm(path).quality(quality).resize(newWidth, newHeight).toBuffer(ext(path, exts),function(err, buffer) {
							  if (err) return handle(err);

							  console.log("[imccelerate][cache-stored]", new Date(), req.originalUrl);

							  imgCache.set(key, buffer);
							});
						});
					} else {
						console.log("[imccelerate][cache-hit]", new Date(), req.method, req.originalUrl);
						res.send(imgCache.get(key));

						var base64key = new Buffer(key).toString('base64');
						fs.writeFile(base64key + "." + ext(path,exts),imgCache.get(key), function(err) {
						    if(err) {
						        return console.log(err);
						    }
						    blobSvc.createBlockBlobFromLocalFile('images', base64key, base64key + "." + ext(path,exts), function(error, result, response){
						      if(!error){
						        // file uploaded
						        console.log("Success Cached File");
						      }
						    });

						});
					}
					
				} else {
					res.status(404);
					res.sendFile("File not found, cannot accelerate.");

				}
			}
		} else {
			next();
		}
	}

	function validExt(str, sufs) {
		for (var i = 0; i < sufs.length; i++) {
			if (str.indexOf("." + sufs[i], str.length - "." + sufs[i].length) !== -1) {
				return true;
			}
		}

    	return false;
	}

	function ext(str, sufs) {
		for (var i = 0; i < sufs.length; i++) {
			if (str.indexOf("." + sufs[i], str.length - "." + sufs[i].length) !== -1) {
				return sufs[i].toUpperCase();
			}
		}

    	return false;
	}

	function fileExists(filePath) {
	    try {
	        return fs.statSync(filePath).isFile();
	    } catch (err) {
	        return false;
	    }
	}
}