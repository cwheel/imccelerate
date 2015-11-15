var fs = require('fs');
var lru = require("lru-cache");
var gm = require('gm');
var azure = require('azure-storage');
var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
var compression = require('compression');

var oxford = require('project-oxford'),
    client = new oxford.Client(config.azure["oxfordKey"]);

var blobSvc = azure.createBlobService(config.azure.storageAccount, config.azure["storageKey"]);
var cdnUrlBase = config.azure.cdnUrl + config.azure.containerName + "/"

blobSvc.createContainerIfNotExists(config.azure.containerName,{publicAccessLevel : 'container'} , function(error, result, response){
  if (!error) {
    console.log("[imccelerate][azure] CDN image container created");
  } else {
    console.log(error);
  }
});

module.exports = function (app, exts, dir, cndCostPerGig, cdnMin, life) {
	//1GB LRU
	var imgCache = lru({length: function (n) { n.length }, max: 1024*1024*1024, maxAge: life});

	var stats = {'readMb' : 0, 'sentMb' : 0, 'savedMb' : 0};
	var readSizes = {};
	var cdnCost = 0;

	app.use(compression());

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
		send.imgs = [];

		imgCache.forEach(function (val, curKey, cache) {
			send.imgs.push({key: curKey, cdn: val.cdnUrl});
		});

		res.send(send);
	});

	app.get('/imccelerate', function(req, res) {
		res.sendFile(__dirname + "/lib/dashboard.html");
	});

	app.get('/slow', function(req, res) {
		res.sendFile(__dirname + "/public/ns.html");
	});

	return function(req, res, next) {
		if (req.originalUrl.indexOf(".") > -1) {
			if (validExt(req.originalUrl, exts)) {
				var url = req.originalUrl;
				var query = '';
				var scale = 1;
				var blur = 0;

				if (req.originalUrl.indexOf('-') > -1) {
					query = req.originalUrl.split('-')[1];
					url = req.originalUrl.replace('-' + query, "");
				}
				
				var path = dir + url;
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

					res.sendFile(path);
					return;
				} 

				

				if (fileExists(path)) {
					var key = path + req.session.width + req.session.height + req.session.ratio + query;
					var cacheItem = imgCache.get(key);

					if(query == "cache"){

						if (cacheItem == null){
							gm(path).size(function(err, image) {
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
							gm(path).quality(95).resize(newWidth, newHeight).toBuffer(ext(path, exts),function(err, buffer) {
								  if (err) return handle(err);

								  imgCache.set(key, {'buffer' : buffer, 'cdnUrl' : '', 'bandwidth' : 0, 'height' : req.session.height, 'width' : req.session.width, 'path': path});


									var base64key = new Buffer(key).toString('base64');
									fs.writeFile("tmp/" + base64key + "." + ext(path,exts), imgCache.get(key).buffer, function(err) {
									    if (err) {
									        return console.log(err);
									    }

									    blobSvc.createBlockBlobFromLocalFile(config.azure.containerName, base64key, "tmp/" + base64key + "." + ext(path,exts), function(error, result, response){
									      if (!error){
									      	cacheItem = imgCache.get(key);
									        imgCache.del(key);
									        cacheItem.cdnUrl = base64key;

									        imgCache.set(key, cacheItem);

									        cdnCost += (cacheItem.buffer.length/1024/1024/1024)*cndCostPerGig;

									        console.log("[imccelerate][cdn-stored-forced]", new Date(), key);
									      }
									    });
							});
							});
							});
							res.sendFile(path);
						} else {
							cdnCost += (cacheItem.buffer.length/1024/1024/1024)*cndCostPerGig;

							res.redirect(cdnUrlBase + cacheItem.cdnUrl);
						}
					}else if (cacheItem == null) {
						console.log("[imccelerate][cache-miss]", new Date(), req.method, req.originalUrl);
						similarKey = null;
						stopLoop = false;
						imgCache.forEach(function (val, curKey, cache) {
							if (!stopLoop){
								if ((Math.abs(req.session.width - val.width) < 200 || Math.abs(req.session.height  - val.height) < 200) && path == val.path){
									console.log("[imccelerate][found-similar-match]", new Date(), key);
									similarKey = curKey;
									stopLoop = true;
								}		
							}
						});

						if(stopLoop){
							res.send(imgCache.get(similarKey).buffer)
						}

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

						  	if (query.indexOf("profile") > -1){
						  		quality = 95;
						  	}

						  	gm(path).quality(quality).resize(newWidth, newHeight).toBuffer(ext(path, exts),function(err, buffer) {
							  if (err) return handle(err);

							  console.log("[imccelerate][cache-stored]", new Date(), req.originalUrl);

							  	if(query.indexOf("profile") > -1){
							  		args = query.replace("profile","").split(",");
							  		client.vision.thumbnail({
							  		    path: path,
							  		    height: args[0]*2,
							  		    width: args[1]*2,
							  		    smartCropping: true,
							  		    pipe: fs.createWriteStream('./tmp/' + base64key)
							  		}).then(function (response) {
							  		  	gm("./tmp/" + base64key).quality(quality).resize(args[0]*2, args[1]*2).toBuffer(ext(path, exts),function(err, buffer) {
							  			  if (err) return handle(err);

							  			  console.log("[imccelerate][cache-stored-thumb]", new Date(), req.originalUrl);
							  			  
							  			  readSizes[path] = sizeBytes/1024/1024;
							  			  stats.readMb += sizeBytes/1024/1024;
							  			  stats.sentMb += buffer.length/1024/1024;

							  			  imgCache.set(key, {'buffer' : buffer, 'cdnUrl' : '', 'bandwidth' : 0, 'height' : req.session.height, 'width' : req.session.width, 'path': path});
							  			});
							          });
							  	}else{
								  readSizes[path] = sizeBytes/1024/1024;
								  stats.readMb += sizeBytes/1024/1024;
								  stats.sentMb += buffer.length/1024/1024;

								  imgCache.set(key, {'buffer' : buffer, 'cdnUrl' : '', 'bandwidth' : 0, 'height' : req.session.height, 'width' : req.session.width, 'path': path});
								}
							});	
						});
						if (!stopLoop){
							res.sendFile(path);
						}
					} else if (cacheItem.cdnUrl != '') {
						console.log("[imccelerate][cdn-hit]", new Date(), req.method, req.url);
						cdnCost += (cacheItem.buffer.length/1024/1024/1024)*cndCostPerGig;

						res.redirect(cdnUrlBase + cacheItem.cdnUrl);
					} else if (cacheItem.bandwidth > cdnMin) {
						var base64key = new Buffer(key).toString('base64');
						fs.writeFile("tmp/" + base64key + "." + ext(path,exts), cacheItem.buffer, function(err) {
						    if (err) {
						        return console.log(err);
						    }

						    blobSvc.createBlockBlobFromLocalFile(config.azure.containerName, base64key, "tmp/" + base64key + "." + ext(path,exts), function(error, result, response){
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
			} else {
				next();
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
