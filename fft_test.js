var complex_array = require('./lib/complex_array.js');
var fft = require('./lib/fft.js');
var csv = require('fast-csv');
var fs = require('fs');
var _ = require('lodash');

var rawData = [];
var xs = [];
var vms = [];

var STRENGTH = [];
var FREQUENCIES = [];
var ONE_EIGHTY_OVER_PI = 180 / Math.PI;
var dfIdx = -1;

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
                xs.push(newItem.x);
            } else {
                console.error("ERROR IN ROW", row);
                console.error(data[0], newItem);
            }
            row++;

        })
        .on("end", function() {
            console.log(rawData.length + " items loaded");
            processData(rawData);
        });

    stream.pipe(csvStream);
}

function processData(rawData) {
    console.log("Begin process");

    // Compute vector magnitudes of all raw data
    for (var i = 0; i < rawData.length; ++i) {
        vms.push(getVectorMagnitude(rawData[i]));
    }

    // Write magnitudes to a file
    var csvStream = csv.createWriteStream({
            headers: false
        }),
        writableStream = fs.createWriteStream(FILENAME + "_vectormagnitudes.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing vms to file");
    });
    csvStream.pipe(writableStream);

    vms.forEach(function(item, i) {
        csvStream.write({
            a: item
        });
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
        value.real = vms[i];
    });

    console.log("Performing FFT");

    // Perform FFT
    var frequencies = data.FFT();

    // Write magnitudes to a file
    var csvStream = csv.createWriteStream({
            headers: false
        }),
        writableStream = fs.createWriteStream(FILENAME + "_FFT.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing FFT to file");
    });
    csvStream.pipe(writableStream);

    frequencies.forEach(function(item, i) {
        csvStream.write({
            real: item.real,
            imag: item.imag
        });
    });

    csvStream.end();

    // Get signal magnitudes from result
    var strength = frequencies.magnitude();

    // Scale magnitudes
    var scaledStrength = [];
    strength.forEach(function(item, i) {
        scaledStrength.push(item / Math.sqrt(strength.length));
    });

    // Write raw and scaled magnitudes to a file
    var csvStream = csv.createWriteStream({
            headers: true
        }),
        writableStream = fs.createWriteStream(FILENAME + "_magnitudes.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing magnitudes to file");
    });
    csvStream.pipe(writableStream);

    strength.forEach(function(item, i) {
        csvStream.write({
            i: i + 1,
            raw_magnitude: item,
            scaled_magnitude: scaledStrength[i]
        });
    });

    csvStream.end();


    // TODO this should be computed only once
    frequencies2 = [];

    var scale = 30.0 / strength.length;
    for (var i = 1; i < strength.length; i++) {
        frequencies2[i-1] = i * scale;
    }

    frequencies2 = frequencies2.splice(0, Math.ceil(frequencies2.length / 2));

    console.log(frequencies2.length, "frequencies generated");

    // Remove first element to eliminate DC
    scaledStrength.shift();

    console.log(scaledStrength.length, "corresponding magnitudes");

    STRENGTH = scaledStrength;
    FREQUENCIES = frequencies2;

    console.log("Done process");

    runAnalysis();
}


function runAnalysis() {
    console.log("Begin Analysis");

    console.log("Computing Feature 1");
    var f1_avgVectorMagnitudes = average(vms);

    console.log("Computing Feature 2");
    var f2_stdDevVectorMagnitudes = standardDeviation(vms);

    console.log("Computing Feature 3 and 4");
    // Used for mangle and sdangle
    var angles = getAngles(xs, vms);
    var f3_mangle = average(angles);
    var f4_sdAngle = standardDeviation(angles);

    console.log("Computing Feature 5");
    var f5_p625 = getP625(FREQUENCIES, STRENGTH);

    console.log("Computing Feature 6");
    var f6_df = getDominantFrequency(FREQUENCIES, STRENGTH);

    console.log("Computing Feature 7");
    var f7_fpdf = getFpdf(STRENGTH, dfIdx);

    console.log(f1_avgVectorMagnitudes, f2_stdDevVectorMagnitudes, f3_mangle, f4_sdAngle, f5_p625, f6_df, f7_fpdf);


    var csvStream = csv.createWriteStream({
            headers: true
        }),
        writableStream = fs.createWriteStream(FILENAME + "_features.csv");

    writableStream.on("finish", function() {
        console.log("Finished writing features to file");
    });
    csvStream.pipe(writableStream);
    csvStream.write({
        AvgVM: f1_avgVectorMagnitudes,
        stdDevVM: f2_stdDevVectorMagnitudes,
        mangle: f3_mangle,
        sdangle: f4_sdAngle,
        p625: f5_p625,
        df: f6_df,
        fpdf: f7_fpdf
    });
    csvStream.end();
}

function sum(arr){
    return _.reduce(arr, function(sum, n) {
        return sum + n;
    }, 0);
}

function average(arr) {
    return sum(arr) / arr.length;
}

function standardDeviation(arr) {
    var avg = average(arr);

    var squareDiffs = _.map(arr, function(value) {
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
    });

    var avgSquareDiff = average(squareDiffs);

    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}

function getAngles(xs, vms){
    var angles = [];
    for(var i = 0; i < xs.length; i++){
        angles.push((xs[i]/vms[i]) * ONE_EIGHTY_OVER_PI);
    }
    return angles;
}

function getP625(freqs, mags){
    // TODO these should be computed only once
    var point6Hz = getClosestIndex(freqs, 0.6);
    var twoPoint5Hz = getClosestIndex(freqs, 2.5);
    var fiveHz = getClosestIndex(freqs, 5);

    var numerator = average(_.slice(STRENGTH, point6Hz, twoPoint5Hz+1));
    var denominator = average(_.slice(STRENGTH, 0, fiveHz+1));

    return numerator/denominator;
}

function getDominantFrequency(freqs, mags){
    var highestIdx = 0;
    var max = -1;

    for(var i = 0; i < mags.length; i++){
        if(mags[i] > max){
            highestIdx = i;
            max = mags[i];
        }
    }

    dfIdx = highestIdx;

    return freqs[highestIdx];
}

function getFpdf(mags, dfIdx){
    var sumStrength = sum(mags);

    var numSum = mags[dfIdx];

    // left 2 points
    var i = dfIdx - 1;
    while(i >= 0 && dfIdx - i < 3){
        numSum += mags[i--];
    }

    // right 2 points
    i = dfIdx + 1;
    while(i < mags.length && i - dfIdx < 3){
        numSum += mags[i++];
    }

    return numSum/sumStrength;

}

function getClosestIndex(arr, val){
    var i = 0;
    while(arr[i] < val){
        i++;
    }
    return i-1;
}

function getVectorMagnitude(data) {
    return Math.sqrt(Math.pow(data.x, 2) + Math.pow(data.y, 2) + Math.pow(data.z, 2));
}
