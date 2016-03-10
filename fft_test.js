var complex_array = require('./lib/complex_array.js');
var fft = require('./lib/fft.js');
var csv = require('fast-csv');
var fs = require('fs');

var rawData = [];
var vms = [];

/**
    Input file containing raw accelerometer data with NO headers
    Timestamp | accelX | accelY | accelZ
*/
var FILENAME = "data/nonulls/time_chores_matin.csv";

loadData();

function loadData() {
    console.log("Begin load");
    var stream = fs.createReadStream(FILENAME);

    var row = 1;

    var csvStream = csv()
        .on("data", function(data) {
            var newItem = {
                timestamp: new Date(data[0]),
                x: parseFloat(data[1]),
                y: parseFloat(data[2]),
                z: parseFloat(data[3])
            };
            if (Object.prototype.toString.call(newItem.timestamp) === "[object Date]" && !isNaN(newItem.timestamp.getTime())) {
                rawData.push(newItem);
            }
            else{
                console.error(data[0]);
                console.error(row, newItem);
            }
            row++;

        })
        .on("end", function() {
            console.log(rawData.length + " items");
            console.log("Done load");
            console.log(rawData.length);
            processData(rawData);
        });

    stream.pipe(csvStream);
}

function processData(rawData) {
    console.log("Begin process");

    // Compute vector magnitudes of all raw data
    for (var i = 0; i < rawData.length; ++i) {
        vms.push({
            timestamp: rawData[i].timestamp,
            vm: getVectorMagnitude(rawData[i])
        });
    }

    // Write magnitudes to a file
    var csvStream = csv.createWriteStream({headers: false}),
    writableStream = fs.createWriteStream(FILENAME + "_vectormagnitudes.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing vms to file");
    });
    csvStream.pipe(writableStream);

    vms.forEach(function(item, i) {
        csvStream.write({a: item.vm});
    });

    csvStream.end();

    // // Loop over every 15 second interval of data
    // for (var i = 0; i < vms.length; ++i) {
    //     var startIndex = i;
    //     ++i;
    //     while (i < vms.length - 1 && vms[i].timestamp - vms[startIndex].timestamp < 15000) {
    //         ++i;
    //     }
    //     //console.log(i - startIndex);
    // }

    // Convert vm's into complex array for processing
    console.log("Converting to complex array");
    var data = new complex_array.ComplexArray(vms.length);
    data.map(function(value, i, n) {
        value.real = vms[i].vm;
    });

    console.log("Performing FFT");

    // Perform FFT
    var frequencies = data.FFT();

    // Write magnitudes to a file
    var csvStream = csv.createWriteStream({headers: false}),
    writableStream = fs.createWriteStream(FILENAME + "_FFT.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing result to file");
    });
    csvStream.pipe(writableStream);

    frequencies.forEach(function(item, i) {
        csvStream.write({real: item.real, imag: item.imag});
    });

    csvStream.end();

    // Get signal magnitudes from result
    var strength = frequencies.magnitude();

    // Scale magnitudes
    var scaledStrength = [];
    strength.forEach(function(item, i){
        scaledStrength.push(item / Math.sqrt(strength.length));
    });

    // Write raw and scaled magnitudes to a file
    var csvStream = csv.createWriteStream({headers: true}),
    writableStream = fs.createWriteStream(FILENAME + "_magnitudes.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing result to file");
    });
    csvStream.pipe(writableStream);

    strength.forEach(function(item, i) {
        csvStream.write({i: i+1, raw_magnitude: item, scaled_magnitude: scaledStrength[i]});
    });

    csvStream.end();


    frequencies2 = [];

    var scale = 30.0 / strength.length;
    for(var i = 1; i < strength.length; i++){
        frequencies2[i] = i * scale;
    }

    frequencies2 = frequencies2.splice(0,Math.ceil(frequencies2.length / 2));

    console.log(frequencies2.length, frequencies2[frequencies2.length-1]);


    // Remove first element to eliminate DC
    scaledStrength.shift();


    console.log("Done process");
}

function getVectorMagnitude(data) {
    return Math.sqrt(Math.pow(data.x, 2) + Math.pow(data.y, 2) + Math.pow(data.z, 2));
}
