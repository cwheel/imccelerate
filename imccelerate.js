var fs = require('fs');
var lru = require("lru-cache");

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
				console.log(req.session);

				if (fileExists(path)) {
					var cacheItem = imgCache.get(path);
					
					if (cacheItem == null) {
						console.log("[imccelerate][cache-miss]", new Date(), req.method, req.originalUrl);

						fs.readFile(path, function (err,data) {
						  if (err) {
						    return console.log(err);
						  }

						  imgCache.set(path, data);
						  console.log("[imccelerate][cache-stored]", new Date(), req.originalUrl);
						});

						imgCache.set(path, null);
						res.sendFile(path);
					} else {
						console.log("[imccelerate][cache-hit]", new Date(), req.method, req.originalUrl);
						res.send(imgCache.get(path));
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