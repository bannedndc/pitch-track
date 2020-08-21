/* Helper functions from https://github.com/cwilso/PitchDetect */

var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

function autoCorrelate(buf, sampleRate) {
  var SIZE = buf.length;
  var MAX_SAMPLES = Math.floor(SIZE / 2);
  var best_offset = -1;
  var best_correlation = 0;
  var rms = 0;
  var foundGoodCorrelation = false;
  var correlations = new Array(MAX_SAMPLES);

  for (var i = 0; i < SIZE; i++) {
    var val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) // not enough signal
    return -1;

  var lastCorrelation = 1;
  for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
    var correlation = 0;

    for (var i = 0; i < MAX_SAMPLES; i++) {
        correlation += Math.abs((buf[i]) - (buf[i + offset]));
    }
    correlation = 1 - (correlation / MAX_SAMPLES);
    correlations[offset] = correlation; // store it, for the tweaking we need to do below.
    if ((correlation > GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
        foundGoodCorrelation = true;
        if (correlation > best_correlation) {
            best_correlation = correlation;
            best_offset = offset;
        }
    } else if (foundGoodCorrelation) {
        // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
        // Now we need to tweak the offset - by interpolating between the values to the left and right of the
        // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
        // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
        // (anti-aliased) offset.

        // we know best_offset >=1, 
        // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
        // we can't drop into this clause until the following pass (else if).
        var shift = (correlations[best_offset + 1] - correlations[best_offset - 1]) / correlations[best_offset];
        return sampleRate / (best_offset + (8 * shift));
    }
    lastCorrelation = correlation;
  }
  if (best_correlation > 0.01) {
      // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
      return sampleRate / best_offset;
  }
  return -1;
  //	var best_frequency = sampleRate/best_offset;
}

function noteFromFrequency( frequency ) {
  var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
  return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
  return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
  return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}

/* End helper functions */

// STEP 2: Create the audio source from microphone
function getMicrophoneStream(constraints) {

  // get microphone stream
  navigator.mediaDevices.getUserMedia(constraints)
    .then(function (stream) {
        currentStream = stream;
        enableMicBtn.innerHTML = 'Disable microphone';
        console.log('success getting stream');

        // hook it up to audio context
        source = audioContext.createMediaStreamSource(stream);


        //STEP 3: Determine the pitch of the microphone stream
        startPitchTrack();

    })
    .catch(function (err) {
        /* handle the error */
        enableMicBtn.innerHTML = 'Enable microphone';
        alert('error getting stream');
    });

}

//Stop the microphone stream
function stopStream() {
  if(currentStream !== null) {
    let tracks = currentStream.getTracks();

    //stop each one
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].stop();
    }
    console.log('Stopped microphone stream');
  }
}


function startPitchTrack() {
  //analyze the stream
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  //determine the pitch - continuously
  getPitch();
}

function getPitch() {
  analyser.getFloatTimeDomainData(buffer);
  let frequencyInHz = autoCorrelate(buffer, audioContext.sampleRate);

  //update the UI - continuously
  if(frequencyInHz == -1) {
    noteElem.innerHTML = "-";
    hzElem.innerHTML = ""; 
    detuneElem.innerHTML = "";
  } else {
    console.log(frequencyInHz);
    let midiNote = noteFromFrequency(frequencyInHz);
    noteElem.innerHTML = noteStrings[midiNote%12];
    hzElem.innerHTML = Math.round(frequencyInHz) + " hz";
    let detune = centsOffFromPitch(frequencyInHz, midiNote);
    detuneElem.innerHTML = detune;

    if(detune < 0) {
        detuneWarningElem.innerHTML = "FLAT";
        detuneWarningElem.className = "flat";
    } else {
        detuneWarningElem.innerHTML = "SHARP";
        detuneWarningElem.className = "sharp";
    }

    if(detune > -10 && detune < 10) {
        detuneWarningElem.innerHTML = "IN TUNE";
        detuneWarningElem.className = "in-tune";
    }
  }

  if(!window.requestAnimationFrame) {
    window.requestAnimationFrame = window.webkitRequestAnimationFrame;
  }
  rafID = window.requestAnimationFrame(getPitch);

}

// Start of the world
function main() {

  // whats the state of the button?
  let micToggleState = (enableMicBtn.getAttribute("data-tracking") === 'true');
  enableMicBtn.setAttribute("data-tracking", !micToggleState);
  micToggleState = (enableMicBtn.getAttribute("data-tracking") === 'true');

  // if the state of the button is to enable mic
  if(micToggleState === true) {

    //Initializing context
    audioContext = new AudioContext();

    enableMicBtn.innerHTML = 'enabling';

    getMicrophoneStream(constraints);

  }
  // else if the state of the button is to disable the mic
  else {
    // lets go ahead and cut off any potential connections to the microphone
    // and make the button say "enable" (toggle its state)
    stopStream();
    enableMicBtn.innerHTML = 'Enable mic';
    window.cancelAnimationFrame(rafID);

  }

}

//Variables

//Initialize audio context
let audioContext = null;
window.AudioContext = window.AudioContext || window.webkitAudioContext;

let constraints = { audio: true, video: false };

let currentStream = null;
let source = null;

let analyser = null;
let bufferLength = 1024;
let buffer = new Float32Array(bufferLength);

let rafID = null;

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const enableMicBtn = document.getElementById("enable-mic");
const noteElem = document.getElementById("note");
const hzElem = document.getElementById("hz");
const detuneElem = document.getElementById("detune");
const detuneWarningElem = document.getElementById("detune-warning");

enableMicBtn.onclick = main;
