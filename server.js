var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var app = express();

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(cookieParser());
app.use(session({ 
	secret: 'imccelerate', 
	saveUninitialized: true, 
	resave: true
}));

app.use(express.static(__dirname + '/public'));
app.listen(3000);
 
exports = module.exports = app;