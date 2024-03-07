let inputStates = {};

function updateInputState({id, inputState}) {
	inputStates[id] = inputState;
}

const dispatchMap = {
	processVideoFrames:	function (processVideoFramesArg) {
		importScripts('process-video-frames.js');
		// Store the inputStates object so that it can be updated.
		inputStates = processVideoFramesArg.inputStates;
		processVideoFrames(processVideoFramesArg);
	},
	updateInputState,
};

self.onmessage = ({data: {name, args}}) => dispatchMap[name](...args);
