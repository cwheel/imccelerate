var fs = require('fs');
var lru = require("lru-cache");
var gm = require('gm');
var azure = require('azure-storage');
var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var accessKey = config.azure["accessKey"];
var storageAccount = 'imccelerate';
var blobSvc = azure.createBlobService(storageAccount, accessKey);
var cdnUrlBase = "http://az834420.vo.msecnd.net/images/"

blobSvc.createContainerIfNotExists('images',{publicAccessLevel : 'container'} , function(error, result, response){
  if (!error) {
    console.log("[imccelerate][azure] CDN image container created");
  } else {
    console.log(error);
  }
});

module.exports = function (app, exts, dir, cndCostPerGig, cdnMin) {
	//1GB LRU
	var imgCache = lru({length: function (n) { n.length }, max: 1024*1024*1024});

	var stats = {'readMb' : 0, 'sentMb' : 0, 'savedMb' : 0};
	var readSizes = {};
	var cdnCost = 0;

	app.post('/imccelerate_enable', function(req, res) {
		req.session.width = req.body.width;
		req.session.height = req.body.height;
		req.session.heightScreen = req.body.heightScreen;
		req.session.widthScreen = req.body.widthScreen;
		req.session.ratio = req.body.ratio;

		res.send("session_stored");
	});

	app.get('/imccelerate_stats', function(req, res) {
		var send = stats;
		send.reads = Object.keys(readSizes).length;
		send.cdnCost = cdnCost;

		res.send(send);
	});

	app.get('/imccelerate', function(req, res) {
		res.sendFile(__dirname + "/lib/dashboard.html");
	});

	return function(req, res, next) {
		if (req.originalUrl.indexOf(".") > -1) {
			if (validExt(req.originalUrl, exts)) {
				var url = req.originalUrl;
				var query = '';
				var scale = 1;

				if (req.originalUrl.indexOf('-') > -1) {
					query = req.originalUrl.split('-')[1];
					url = req.originalUrl.replace('-' + query, "");
				}

				if (query == 'xs') {
					scale = 0.1;
				} else if (query == 'sm') {
					scale = 0.25;
				} else if (query == 'md') {
					scale = 0.6;
				} else if (query == 'lg') {
					scale = 0.8;
				} else if (query == 'xl') {
					scale = 1;
				} else if (query == 'ignore') {
					next();
				} 

				var path = dir + url;

				if (fileExists(path)) {
					var key = path + req.session.width + req.session.height + req.session.ratio + query;
					var cacheItem = imgCache.get(key);
					
					if (cacheItem == null) {
						console.log("[imccelerate][cache-miss]", new Date(), req.method, req.originalUrl);

						gm(path).size(function(err, image) {
						  	if (err) return handle(err);
						  	
						  	var quality = 100;
						  	// Determine quality based roughly on the quality of their monitor
						  	var screenArea = req.session.heightScreen * req.session.widthScreen;
						  	if (screenArea < 480000) quality = 55;
						  	else if (screenArea < 786431) quality = 65;
						  	else if (screenArea < 1060000) quality = 80;
						  	else if (screenArea < 2400000) quality = 90;
						  	else if (screenArea < 3500000) quality = 95;
						  	console.log(quality);
						  	var newHeight;
						  	var newWidth;

						  	var sizeBytes = fs.statSync(path).size;

						  	if (req.session.width > req.session.height) {
						  		newWidth = ((req.session.width*image.width)/image.height)*scale* req.session.ratio;
						  		newHeight = (req.session.height)*scale*req.session.ratio;

						  	} else {
						  		newHeight = ((req.session.height*image.height)/image.width)*scale* req.session.ratio;
						  		newWidth = (req.session.width)*scale*req.session.ratio;

						  	}

						  	//Manual quality overrides for high DPI screens, ensure that images look sharp
						  	//It's much harder to tell on a low quality screen so scale it pretty low

						  	//Retina
						  	if (req.session.ratio > 1 && req.session.ratio < 2 ) {
						  		quality = 95;
						  	}

						  	//Above Retina (5k iMacs and ....)
						  	if (req.session.ratio > 2) {
						  		quality = 98;
						  	}

						  	newWidth = newWidth * req.session.ratio;
						  	newHeight = newHeight * req.session.ratio;

						  	//TODO: Make this more adaptable
						  	if (req.headers['user-agent'].toLowerCase().indexOf("mobile") > -1) {
						  		quality = quality - 10;
						  	}
						  	gm(path).quality(quality).resize(newWidth, newHeight).toBuffer(ext(path, exts),function(err, buffer) {
							  if (err) return handle(err);

							  console.log("[imccelerate][cache-stored]", new Date(), req.originalUrl);

							  readSizes[path] = sizeBytes/1024/1024;
							  stats.readMb += sizeBytes/1024/1024;
							  stats.sentMb += buffer.length/1024/1024;

							  imgCache.set(key, {'buffer' : buffer, 'cdnUrl' : '', 'bandwidth' : 0});
							});
						});
						res.sendFile(path);
					} else if (cacheItem.cdnUrl != '') {
						console.log("[imccelerate][cdn-hit]", new Date(), req.method, req.originalUrl);
						cdnCost += (cacheItem.buffer.length/1024/1024/1024)*cndCostPerGig;

						res.redirect(cdnUrlBase + cacheItem.cdnUrl);
					} else if (cacheItem.bandwidth > cdnMin) {
						var base64key = new Buffer(key).toString('base64');
						fs.writeFile("tmp/" + base64key + "." + ext(path,exts), cacheItem.buffer, function(err) {
						    if (err) {
						        return console.log(err);
						    }

						    blobSvc.createBlockBlobFromLocalFile('images', base64key, "tmp/" + base64key + "." + ext(path,exts), function(error, result, response){
						      if (!error){
						        imgCache.del(key);
						        cacheItem.cdnUrl = base64key;

						        imgCache.set(key, cacheItem);

						        cdnCost += (cacheItem.buffer.length/1024/1024/1024)*cndCostPerGig;

						        console.log("[imccelerate][cdn-stored]", key);
						      }
						    });
						});
						res.send(cacheItem.buffer)

					} else {
						console.log("[imccelerate][cache-hit]", new Date(), req.method, req.originalUrl);
						
						imgCache.del(key);
						cacheItem.bandwidth += (cacheItem.buffer.length/1024/1024);

						imgCache.set(key, cacheItem);

						stats.savedMb += readSizes[path] - (cacheItem.buffer.length/1024/1024);
						stats.sentMb += cacheItem.buffer.length/1024/1024;						

						res.send(cacheItem.buffer);
					}
					
				} else {
					res.status(404);
					res.send("File not found, cannot accelerate.");

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