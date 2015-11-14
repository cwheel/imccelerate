var fs = require('fs');

module.exports = function (exts, dir) {
	return function(req, res, next) {
		if (req.originalUrl.indexOf(".") > -1) {
			if (ext(req.originalUrl, exts)) {
				var path = dir + req.originalUrl;

				if (fileExists(path)) {
					res.sendFile(path);
				} else {
					res.status(404);
					res.send("File not found, cannot accelerate.");
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