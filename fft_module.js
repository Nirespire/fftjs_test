var complex_array = require('./lib/complex_array.js');
var fft = require('./lib/fft.js');
var csv = require('fast-csv');
var fs = require('fs');
var _ = require('lodash');

var RAW_DATA = [];
var XS = [];
var DF_IDX = -1;
var OUTPUT = [];

var P625 = [];

var ONE_EIGHTY_OVER_PI = 180 / Math.PI;
var POINTS_IN_WINDOW = 450;

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
                RAW_DATA.push(newItem);
            } else {
                console.error("ERROR IN ROW", row);
                console.error(data[0], newItem);
            }
            row++;

        })
        .on("end", function() {
            console.log(RAW_DATA.length + " items loaded");

            for (var i = 0; i < RAW_DATA.length; i++) {
                var rawDataSlice = _.slice(RAW_DATA, i, i + POINTS_IN_WINDOW);
                console.log("Items in current slice", rawDataSlice.length);
                OUTPUT.push(processData(rawDataSlice));
                i += POINTS_IN_WINDOW - 1;
            }


            var csvStream = csv.createWriteStream({
                    headers: true
                }),
                writableStream = fs.createWriteStream(FILENAME + "_all_features.csv");

            writableStream.on("finish", function() {
                console.log("Finished writing features to file");
            });
            csvStream.pipe(writableStream);

            OUTPUT.forEach(function(item, i) {
                csvStream.write({
                    FifteenSecWindow: i,
                    mvm: item.f1,
                    sdvm: item.f2,
                    mangle: item.f3,
                    sdangle: item.f4,
                    p625: item.f5,
                    df: item.f6,
                    fpdf: item.f7,
                });
            });
            csvStream.end();

            var csvStream2 = csv.createWriteStream({
                    headers: true
                }),
                writableStream = fs.createWriteStream(FILENAME + "p625.csv");

            writableStream.on("finish", function() {
                console.log("Finished writing p625 to file");
            });
            csvStream2.pipe(writableStream);

            console.log(P625.length);

            P625.forEach(function(item, i) {
                csvStream2.write({
                    numerator: item.numerator,
                    denominator: item.denominator,
                    point6_magnitude: item.point6_magnitude,
                    twoPoint5_magnitude: item.twoPoint5_magnitude,
                    five_magnitude: item.five_magnitude
                });
            });
            csvStream2.end();
        });

    stream.pipe(csvStream);
}

function processData(rawData) {

    var vms = [];
    var strength = [];
    var frequencies = [];
    var dfIdx = -1;
    var xs = [];

    for (var i = 0; i < rawData.length; i++) {
        xs.push(rawData[i].x);
    }

    console.log("Begin process");

    // Compute vector magnitudes of all raw data
    for (var i = 0; i < rawData.length; ++i) {
        vms.push(getVectorMagnitude(rawData[i]));
    }

    // Convert vm's into complex array for processing
    console.log("Converting to complex array");

    var data = new complex_array.ComplexArray(vms.length);
    data.map(function(value, i, n) {
        value.real = vms[i];
    });

    console.log("Performing FFT");

    // Perform FFT
    var fftResult = data.FFT();

    var unscaledStrength = fftResult.magnitude();

    // Scale magnitudes
    unscaledStrength.forEach(function(item, i) {
        strength.push(item / Math.sqrt(unscaledStrength.length));
    });

    // Generate frequency vector
    var scale = 30.0 / strength.length;
    for (var i = 0; i < strength.length; i++) {
        frequencies[i] = i * scale;
    }

    // Eliminate upper half of the frequencies and strength
    frequencies = frequencies.splice(0, Math.ceil(frequencies.length / 2));
    strength = strength.splice(0, Math.ceil(strength.length / 2));

    console.log(frequencies[frequencies.length-1]);

    // Remove first element to eliminate DC
    strength.shift();
    frequencies.shift();

    return runAnalysis(xs, vms, strength, frequencies);
}

function runAnalysis(xs, vms, strength, frequencies) {
    var f1_avgVectorMagnitudes = average(vms);
    var f2_stdDevVectorMagnitudes = standardDeviation(vms);

    // Used for mangle and sdangle
    var angles = getAngles(xs, vms);
    var f3_mangle = average(angles);
    var f4_sdAngle = standardDeviation(angles);

    var f5_p625 = getP625(frequencies, strength);

    var f6_df = getDominantFrequency(frequencies, strength);

    var f7_fpdf = getFpdf(strength, DF_IDX);

    var output = {
        f1: f1_avgVectorMagnitudes,
        f2: f2_stdDevVectorMagnitudes,
        f3: f3_mangle,
        f4: f4_sdAngle,
        f5: f5_p625,
        f6: f6_df,
        f7: f7_fpdf
    };

    console.log(output);

    return output;
}

function sum(arr) {
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

function getAngles(xs, vms) {
    var angles = [];
    for (var i = 0; i < xs.length; i++) {
        angles.push((xs[i] / vms[i]) * ONE_EIGHTY_OVER_PI);
    }
    return angles;
}

function getP625(freqs, mags) {
    // TODO these should be computed only once

    var point6Hz = getClosestIndexLeft(freqs, 0.6);
    var twoPoint5Hz = getClosestIndexRight(freqs, 2.5);
    var fiveHz = getClosestIndexLeft(freqs, 5);

    console.log(point6Hz, twoPoint5Hz, fiveHz);
    console.log(freqs[point6Hz], freqs[twoPoint5Hz], freqs[fiveHz]);
    console.log(freqs[point6Hz+1], freqs[twoPoint5Hz-1], freqs[fiveHz+1]);

    var numerator = sum(_.slice(mags, point6Hz, twoPoint5Hz - 1));
    var denominator = sum(mags, 0, fiveHz - 1);

    console.log("numerator", numerator, "denominator", denominator);

    P625.push({
        numerator: numerator,
        denominator: denominator,
        point6_magnitude: mags[point6Hz],
        twoPoint5_magnitude: mags[twoPoint5Hz],
        five_magnitude: mags[fiveHz]
    });

    return (numerator / denominator);
}

function getDominantFrequency(freqs, mags) {
    var highestIdx = 0;
    var max = -1;

    for (var i = 0; i < mags.length; i++) {
        if (mags[i] > max) {
            highestIdx = i;
            max = mags[i];
        }
    }

    DF_IDX = highestIdx;

    return freqs[highestIdx];
}

function getFpdf(mags, dfIdx) {
    var sumStrength = sum(mags);

    var numSum = mags[dfIdx];

    // left 2 points
    var i = dfIdx - 1;
    while (i >= 0 && dfIdx - i < 3) {
        numSum += mags[i--];
    }

    // right 2 points
    i = dfIdx + 1;
    while (i < mags.length && i - dfIdx < 3) {
        numSum += mags[i++];
    }

    console.log(numSum, sumStrength);

    return numSum / sumStrength;

}

function getClosestIndexLeft(arr, val) {
    var i = 0;
    while (arr[i] < val) {
        i++;
    }

    if(arr[i+1] === val){
      return i+1;
    }

    if (i === 0) {
        i++;
    }

    return i - 1;
}

function getClosestIndexRight(arr, val){
    var i = 0;
    while (arr[i] < val) {
        i++;
    }

    if(arr[i+1] === val){
      return i+1;
    }

    if (i === 0) {
        i++;
    }

    if(i === arr.length){
        i--;
    }

    return i;
}

function getVectorMagnitude(data) {
    return Math.sqrt(Math.pow(data.x, 2) + Math.pow(data.y, 2) + Math.pow(data.z, 2));
}
