var express = require('express');
var app = express();
var server = require('http').createServer(app);
var path = require('path');
var bodyParser = require('body-parser');
app.use(bodyParser.json({ type: 'application/json' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

var routes = require('./routes/index');
app.use('/', routes);
app.set('views', path.join(__dirname, 'views'));
app.set('port', (8001));

server.listen(app.get('port'), function() {
    console.log('NAT Test App Started on port ' + app.get('port'));
});