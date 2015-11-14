var fs = require('fs');
var lru = require("lru-cache");
var gm = require('gm');

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

						  		quality = (image.width*100)/newWidth;
						  	} else {
						  		newHeight = ((req.session.height*image.height)/image.width)*scale;
						  		newWidth = (req.session.width)*scale;

						  		quality = (image.height*100)/newHeight;
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

						  	gm(path).quality(quality).resize(newWidth, newHeight).toBuffer(ext(path, exts),function(err, buffer) {
							  if (err) return handle(err);

							  console.log("[imccelerate][cache-stored]", new Date(), req.originalUrl);

							  imgCache.set(key, buffer);
							});
						});
					} else {
						console.log("[imccelerate][cache-hit]", new Date(), req.method, req.originalUrl);
						res.send(imgCache.get(key));
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
				return str.toUpperCase();
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