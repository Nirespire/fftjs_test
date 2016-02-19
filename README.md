# fftjs_test

## How to Run

- Run `npm install`

- Make sure the CSV file is formatter as follows (with no headers)

  - Timestamp | accelX | accelY | accelZ

- Modify the `FILENAME` var in __fft_test.js__ to the appropriate filename/filepath

- Run `node fft_test.js`

- Output will include __FILENAME_magnitudes.csv__ and __FILENAME_FFT.csv__

## Libraries used
- https://github.com/dntj/jsfft
- https://github.com/C2FO/fast-csv

