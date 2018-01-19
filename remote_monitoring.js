// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

'use strict';

// Azure IoT packages
var Protocol = require('azure-iot-device-http').Http;
var Client = require('azure-iot-device').Client;
var ConnectionString = require('azure-iot-device').ConnectionString;
var Message = require('azure-iot-device').Message;

// Edison packages
var five = require("johnny-five");
var Edison = require("edison-io");
var board = new five.Board({
	io: new Edison()
});

var hostName = 'monitorlizardbd6c5.azure-devices.net';
var deviceId = 'eddie';
var sharedAccessKey = 'NcYHi5oRyclztpG7F0yoh34086K97a8bA5oKiIepcrU=';

// String containing Hostname, Device Id & Device Key in the following formats:
//  "HostName=<iothub_host_name>;DeviceId=<device_id>;SharedAccessKey=<device_key>"
var connectionString = 'HostName=' + hostName + ';DeviceId=' + deviceId + ';SharedAccessKey=' + sharedAccessKey;

// Sensor data
var temperature = 0;
var humidity = 0;
var externalTemperature = 0;
var lumens = 0;

// Create IoT Hub client
var client = Client.fromConnectionString(connectionString, Protocol);

// Helper function to print results for an operation
function printErrorFor(op) {
	return function printError(err) {
		if (err) console.log(op + ' error: ' + err.toString());
	};
}

// Send device meta data
var deviceMetaData = {
	'ObjectType': 'DeviceInfo',
	'IsSimulatedDevice': 0,
	'Version': '1.0',
	'DeviceProperties': {
		'DeviceID': deviceId,
		'HubEnabledState': 1,
		'CreatedTime': '2015-09-21T20:28:55.5448990Z',
		'DeviceState': 'normal',
		'UpdatedTime': null,
		'Manufacturer': 'Intel',
		'ModelNumber': 'Edison',
		'SerialNumber': '12345678',
		'FirmwareVersion': '159',
		'Platform': 'node.js',
		'Processor': 'Intel',
		'InstalledRAM': '64 MB',
		'Latitude': 47.617025,
		'Longitude': -122.191285
	},
	'Commands': [{
		'Name': 'SetTemperature',
		'Parameters': [{
			'Name': 'Temperature',
			'Type': 'double'
		}]
	},
		{
			'Name': 'SetHumidity',
			'Parameters': [{
				'Name': 'Humidity',
				'Type': 'double'
			}]
		},
		{
			'Name': 'SetLumens',
			'Parameters': [{
				'Name': 'Level',
				'Type': 'double'
			}]
		}
	]
};


board.on("ready", function () {
	var temp = new five.Temperature({
		pin: "A0",
		controller: "GROVE"
	});

	var light = new five.Light({
		pin: "A1",
		controller: "GROVE"
	});
	light.on("change", function() {
		console.log('AMBIENT LIGHT LEVEL: ', this.level);
	});


	client.open(function (err, result) {
		if (err) {
			printErrorFor('open')(err);
		} else {
			console.log('Sending device metadata:\n' + JSON.stringify(deviceMetaData));
			client.sendEvent(new Message(JSON.stringify(deviceMetaData)), printErrorFor('send metadata'));

			client.on('message', function (msg) {
				console.log('receive data: ' + msg.getData());

				try {
					var command = JSON.parse(msg.getData());

					switch (command.Name) {
						case 'SetTemperature':
							temperature = command.Parameters.Temperature;
							console.log('New temperature set to :' + temperature + 'F');
							client.complete(msg, printErrorFor('complete'));
							break;
						case 'SetHumidity':
							humidity = command.Parameters.Humidity;
							console.log('New humidity set to :' + humidity + '%');
							client.complete(msg, printErrorFor('complete'));
							break;
						// case 'SetLumens':
						// 	lumens = command.Parameters.Level;
						// 	console.log('New Luemns set to :' + lumens + '%');
						// 	client.complete(msg, printErrorFor('complete'));
						// 	break;
						default:
							console.error('Unknown command: ' + command.Name);
							client.reject(msg, printErrorFor('complete'));
							break;
					}
				}
				catch (err) {
					printErrorFor('parse received message')(err);
					client.reject(msg, printErrorFor('reject'));
				}
			});

			// start event data send routing
			var sendInterval = setInterval(function () {
				temperature = temp.celsius;
				var data = JSON.stringify({
					'DeviceID': deviceId,
					'Temperature': temperature,
					'Humidity': humidity,
					// 'Lumens': lumens,
					'ExternalTemperature': externalTemperature
				});

				console.log('Sending device event data:\n' + data);
				client.sendEvent(new Message(data), printErrorFor('send event'));
			}, 1000);

			client.on('error', function (err) {
				printErrorFor('client')(err);
				if (sendInterval) clearInterval(sendInterval);
				client.close();
			});
		}
	});
});
