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
			if (ext(req.originalUrl, exts)) {
				var path = dir + req.originalUrl;

				if (fileExists(path)) {
					var key = path + req.session.width + req.session.height + req.session.ratio;
					var cacheItem = imgCache.get(key);
					
					if (cacheItem == null) {
						console.log("[imccelerate][cache-miss]", new Date(), req.method, req.originalUrl);

						res.sendFile(path);

						gm(path).size(function(err, size) {
						  	if (err) {
						  		console.log(err)
						  	}

						  	gm(path).resize(size.width, size.height).toBuffer('JPG',function(err, buffer) {
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

	function ext(str, sufs) {
		for (var i = 0; i < sufs.length; i++) {
			if (str.indexOf("." + sufs[i], str.length - "." + sufs[i].length) !== -1) {
				return true;
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