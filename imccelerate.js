module.exports = function (exts) {
	return function(req, res, next) {
		if (req.originalUrl.indexOf(".") > -1) {
			if (ext(req.originalUrl, exts)) {
				console.log(new Date(), req.method, req.originalUrl);
			}
		}
		
		next();
	}

	function ext(str, sufs) {
		for (var i = 0; i < sufs.length; i++) {
			if (str.indexOf("." + sufs[i], str.length - "." + sufs[i].length) !== -1) {
				return true;
			}
		}

    	return false;
	}
}