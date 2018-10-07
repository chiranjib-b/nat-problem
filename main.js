var express = require('express');
var app = express();
var server = require('http').createServer(app);
var path = require('path');

var routes = require('./routes/index');
app.use('/', routes);

app.set('views', path.join(__dirname, 'views'));
app.set('port', (8001));

server.listen(app.get('port'), function() {
    console.log('NAT Test App Started on port ' + app.get('port'));
});