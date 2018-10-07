'use strict';
var express = require('express');
var router = express.Router();
var path = require('path');
var aws_sdk = require('aws-sdk');

router.get('/', function (req, res) {
  res.sendFile(path.join(__dirname + '/../views/NAT_Test.html'));
});

router.post('/fetchNATInstances', function (req, res) {
  console.log('Searching region ' + req.body.region + ' for NAT instances.');
  var ec2 = new aws_sdk.EC2({
	region: req.body.region
  });
  var instanceParams = {
	DryRun: false,
	Filters: [{
		Name: 'tag:Instance Type',
		Values: ['NAT Test']
	  }]
  };
  ec2.describeInstances(instanceParams).promise()
		  .then(function (response) {
			console.log("Fetched Instances. Sending response.");
			res.send({"Success": true, "Response": response});
		  })
		  .catch(function (error) {
			console.error(error);
			res.status(500).send({"Success": false, "Response": {}});
		  });
});

router.post('/fetchSubnets', function (req, res) {
  console.log('Searching region ' + req.body.region + ' for subnets in VPCs ' + req.body.vpc_list);
  var ec2 = new aws_sdk.EC2({
	region: req.body.region
  });
  var subnetParams = {
	DryRun: false,
	Filters: [{
		Name: 'vpc-id',
		Values: req.body.vpc_list
	  }]
  };
  ec2.describeSubnets(subnetParams).promise()
		  .then(function (response) {
			console.log("Fetched Subnets. Sending response.");
			res.send({"Success": true, "Response": response});
		  })
		  .catch(function (error) {
			console.error(error);
			res.status(500).send({"Success": false, "Response": {}});
		  });
});

router.post('/fetchRouteTables', function (req, res) {
  console.log('Searching region ' + req.body.region + ' for route tables in VPCs ' + req.body.vpc_list);
  var ec2 = new aws_sdk.EC2({
	region: req.body.region
  });
  var rtParams = {
	DryRun: false,
	Filters: [{
		Name: 'vpc-id',
		Values: req.body.vpc_list
	  }]
  };
  var ret = {};
  ec2.describeRouteTables(rtParams).promise()
		  .then(function (response) {
			ret = response;
			console.log("Fetched Route Tables. Sending response.");
			res.send({'Success': true, Response: ret});
		  })
		  .catch(function (error) {
			console.error(error);
			res.status(500).send({"Success": false, "Response": {}});
		  });
});

router.post('/fixBlackHoles', function (req, res) {
  var ec2 = new aws_sdk.EC2({
	region: req.body.region
  });

  var messages = [];
  var subnetsToFix = [];
  console.log(JSON.stringify(req.body.route_tables.RouteTables, null, "  "));
  req.body.route_tables.RouteTables.forEach(rt => {
	rt.Routes.forEach(route => {
	  if (route["DestinationCidrBlock"] === "0.0.0.0/0" && route["State"] === "blackhole") {
		/* This means it is a route which dictates traffic to NAT instance and is broken */
		rt.Associations.forEach(asc => {
		  if (asc.Main === "false") {
			subnetsToFix.push(asc.SubnetId);
			var params = {
			  AssociationId: asc.RouteTableAssociationId,
			  DryRun: false
			};
			ec2.disassociateRouteTable(params).promise()
					.then(data => {
					  console.log(data);
					})
					.catch(err => {
					  console.error(err, err.stack);
					});
		  }
		});
	  }
	});
  });

  /* First populate a map of working RTs per AZ */
  var workingRTInAZ = {};
  var instancesInAZ = {};
  req.body.nat_instances.Reservations.forEach(r => {
	r.Instances.forEach(i => {
	  if (typeof workingRTInAZ[i.Placement.AvailabilityZone] === "undefined")
		workingRTInAZ[i.Placement.AvailabilityZone] = [];
	  if (typeof instancesInAZ[i.Placement.AvailabilityZone] === "undefined")
		instancesInAZ[i.Placement.AvailabilityZone] = [];
	  if (i.State.Name.toLowerCase() === 'running')
		instancesInAZ[i.Placement.AvailabilityZone].push(i.InstanceId);
	});
  });

  req.body.route_tables.RouteTables.forEach(rt => {
	rt.Routes.forEach(route => {
	  Object.keys(instancesInAZ).forEach(az => {
		if (route.DestinationCidrBlock === '0.0.0.0/0'
				&& instancesInAZ[az].indexOf(route.InstanceId) > -1) {
		  /* Working Route Table */
		  workingRTInAZ[az].push(rt);
		}
	  });
	});
  });
  
  var available = 0;
  Object.keys(workingRTInAZ).forEach(az=> {
	available += workingRTInAZ[az].length;
  });
  
  if (available === 0){
	res.send({Success: false, Message: "No healthy NAT found to attach!"});
	return;
  }

  if (subnetsToFix.length === 0) {
	res.send({Success: true, Message: "All subnets are associated with working NAT instances"});
  } else {
	/* Now find a working route in the same AZ */
	subnetsToFix.forEach(subnetId => {
	  var az = req.body.subnets.Subnets.filter(s => s.SubnetId === subnetId)[0].AvailabilityZone;
	  var randomRT = null;
	  if (typeof workingRTInAZ[az] !== "undefined" && workingRTInAZ[az].length > 0) {
		randomRT = workingRTInAZ[az][Math.floor(Math.random() * workingRTInAZ[az].length)];
	  } else {
		var keys = Object.keys(workingRTInAZ);
		for (var i = 0; i < keys.length; i++) {
		  if (workingRTInAZ[keys[i]].length > 0) {
			randomRT = workingRTInAZ[keys[i]][Math.floor(Math.random() * workingRTInAZ[keys[i]].length)];
			break;
		  }
		}
	  }

	  if (randomRT !== null) {
		var params = {
		  RouteTableId: randomRT.RouteTableId,
		  SubnetId: subnetId
		};
		messages.push("Associating: " + JSON.stringify(params));
		ec2.associateRouteTable.promise()
				.then(data => {
				  console.log(data);
				})
				.catch(err => {
				  console.error(err, err.stack);
				});
	  }
	});
	res.send({Success: true, Message: messages.join('<br>')});
  }
});

module.exports = router;