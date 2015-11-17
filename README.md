# imccelerate
**imccelerate was chosen as the runner up (second place) project for web at HackRPI**
Imccelerate intercepts all GET requests and inspects them for known image types. If imccelerate detects a request for an image, it will then scale the image appropriately based on the users screen size and screen density. Then, the resulting image is dropped into an LRU cache to let others with the same screen resolution enjoy a massive speed boost in page loading, up to 90% faster with 90% less bandwidth in some of our tests. Furthermore, imccelerate features a proper image sizing system. Why request a massive, 3x page filling image if its just for a thumbnail? We took a cue from Bootstrap and added a variety of sizes ranging from extra small to extra large. These sizes can seamlessly be appended to each image request. Even better, some of our sizes (including a custom profile image size) feature vision logic from Microsoft Oxford. Finally, we attempted to solve one last issue. What happens if a site comes under heavy load and still needs to deliver lots of content? To attempt to solve this, we built a dynamic CDN offloading system. If an image resource becomes too heavily requested to continue its successful delivery, imccelerate will offload the image to Azures high powered content delivery network and seamlessly move clients to it, all without any interruption in service.
# How to use:


```
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var imccelerate = require('./imccelerate');
var app = express();
app.use(imccelerate(app, filetypes, __dirname + '/public', COSTPERGBCDN, MINTOCACHE, LIFE));

```
