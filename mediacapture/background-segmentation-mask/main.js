'use strict';
(function () {
	async function enumerateMediaDevicesAndUpdateSelects() {
		const currentValues = {};
		const devices = await navigator.mediaDevices.enumerateDevices();
		for (const select of document.querySelectorAll('select[id$="DeviceIdSelect"]')) {
			currentValues[select.id] = select.value;
			for (const option of select.options) {
				if (option.value)
					select.removeChild(option);
			}
		}
		for (const deviceInfo of devices) {
			if (!deviceInfo.label)
				continue;
			const option = document.createElement('option');
			option.label = deviceInfo.label;
			option.value = deviceInfo.deviceId;
			if (deviceInfo.kind == 'videoinput') {
				option.selected = deviceInfo.deviceId == currentValues[videoDeviceIdSelect.id];
				videoDeviceIdSelect.appendChild(option);
			}
		}
	}

	let worker = null;

	// Collect input states and keep them up-to-date
	// so that the input states can be accessed both from here and
	// from the worker.
	const inputStates = {};
	async function getInputState(input, transfer) {
		const inputState = {};
		if (input.checked !== undefined)
			inputState.checked = input.checked;
		if (input.files && input.files[0]) {
			const imageBitmap = await maybeCreateImageBitmap(input.files[0]);
			if (imageBitmap) {
				inputState.files = [imageBitmap];
				if (transfer !== undefined)
					transfer.push(imageBitmap);
			}
		}
		if (input.selected !== undefined)
			inputState.selected = input.selected;
		if (input.value !== undefined)
			inputState.value = input.value;
		return inputState;
	}
	async function updateInputState(input) {
		const id = input.id;
		let inputState = inputStates[id] = await getInputState(input);
		if (worker) {
			const transfer = [];
			inputState = await getInputState(inputState);
			worker.postMessage({
				name:	'updateInputState',
				args:	[{id, inputState}]
			}, transfer);
		}
	}
	for (const input of document.querySelectorAll('input[id][type="checkbox"],input[id][type="color"],input[id][type="file"]')) {
		updateInputState(input);
		input.addEventListener('change', event => updateInputState(event.target));
	}

	// Auto-play videos.
	for (const video of document.querySelectorAll('video'))
		video.addEventListener('loadedmetadata', event => {
			event.target.play();
		});

	// Update the support matrix.
	const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
	for (const td of document.querySelectorAll('td.browser.support')) {
		td.className =
			td.className
			.replace(/(?:\s+(?:no|yes))+$/, '')
			.replace(/\s+for-(interface)-(\w+)$/, function (match, type, name) {
				const support = !!window[name] ? 'yes' : 'no';
				return ` for-${type}-${name} ${support}`;
			})
			.replace(/\s+for-(constraint)-(\w+)$/, function (match, type, name) {
				const support = !!supportedConstraints[name] ? 'yes' : 'no';
				return ` for-${type}-${name} ${support}`;
			});
	}

	// Enumerate devices.
	enumerateMediaDevicesAndUpdateSelects();

	getUserMediaButton.addEventListener('click', async event => {
		try {
			// Get a user media stream.
			const stream = await navigator.mediaDevices.getUserMedia({
				audio:	false,
				video:	{
					backgroundMask:	true,
					deviceId:	videoDeviceIdSelect.value  || undefined,
					frameRate:	+videoFrameRateInput.value || undefined,
					height:		+videoHeightInput.value    || undefined,
					width:		+videoWidthInput.value     || undefined,
				}
			});

			// Enumerate devices again. Permissions may have changed.
			enumerateMediaDevicesAndUpdateSelects();

			// Get a video track.
			const [videoTrack] = stream.getVideoTracks();

			// Allow the video track to be stopped.
			stopVideoTrackButton.click();
			stopVideoTrackButton.addEventListener('click', event => {
				videoTrack.stop();
				event.target.disabled = true;
			}, {once: true});
			stopVideoTrackButton.disabled = false;

			// Get and log video capabilities, constraints and settings.
			const videoCapabilities = videoTrack.getCapabilities?.();
			const videoConstraints = videoTrack.getConstraints();
			const videoSettings = videoTrack.getSettings();
			console.log({
				videoCapabilities,
				videoConstraints,
				videoSettings
			});

			// Update the support matrix.
			for (const td of document.querySelectorAll('td.video-track.support')) {
				td.className =
					td.className
					.replace(/(?:\s+(?:no|yes))+$/, '')
					.replace(/\s+for-(constraint)-(\w+)$/, function (match, type, name) {
						const support = name in videoSettings ? 'yes' : 'no';
						return ` for-${type}-${name} ${support}`;
					});
			}

			// Resize video elements according to the video settings.
			for (const element of document.querySelectorAll('video')) {
				element.height = videoSettings.height;
				element.width = videoSettings.width;
			}

			// Collect frame statistics.
			if (videoTrack.stats) {
				let lastDeliveredFrames = 0;
				const statsIntervalId = setInterval(function () {
					if (videoTrack.readyState != 'live') {
						clearInterval(statsIntervalId);
						return;
					}
					const stats = videoTrack.stats;
					deliveredFrameCountDeltaOutput.value =
						stats.deliveredFrames - lastDeliveredFrames;
					discardedFrameCountOutput.value =
						stats.discardedFrames;
					discardedFrameRateOutput.value =
						100.0 * stats.discardedFrames / (stats.totalFrames || 1);
					lastDeliveredFrames = stats.deliveredFrames;
				}, 1000);
			}

			// Create a video processor and video track generators.
			const videoProcessor =
				new MediaStreamTrackProcessor({track: videoTrack});
			const backgroundColorVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const backgroundImageVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const backgroundVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const backgroundWithForegroundOverlayColorVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const foregroundOverlayColorVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const foregroundVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const foregroundWithBackgroundColorVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const foregroundWithBackgroundImageVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const maskVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const mixedVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});
			const normalVideoGenerator =
				new MediaStreamTrackGenerator({kind: 'video'});

			// Use video track generators as video sources.
			backgroundColorVideo.srcObject =
				new MediaStream([backgroundColorVideoGenerator]);
			backgroundImageVideo.srcObject =
				new MediaStream([backgroundImageVideoGenerator]);
			backgroundVideo.srcObject = new MediaStream([backgroundVideoGenerator]);
			backgroundWithForegroundOverlayColorVideo.srcObject =
				new MediaStream([backgroundWithForegroundOverlayColorVideoGenerator]);
			foregroundOverlayColorVideo.srcObject =
				new MediaStream([foregroundOverlayColorVideoGenerator]);
			foregroundVideo.srcObject = new MediaStream([foregroundVideoGenerator]);
			foregroundWithBackgroundColorVideo.srcObject =
				new MediaStream([foregroundWithBackgroundColorVideoGenerator]);
			foregroundWithBackgroundImageVideo.srcObject =
				new MediaStream([foregroundWithBackgroundImageVideoGenerator]);
			maskVideo.srcObject = new MediaStream([maskVideoGenerator]);
			mixedVideo.srcObject = new MediaStream([mixedVideoGenerator]);
			normalVideo.srcObject = new MediaStream([normalVideoGenerator]);

			// Get readable and writable streams.
			const videoProcessorReadable = videoProcessor.readable;
			const backgroundColorVideoGeneratorWritable =
				backgroundColorVideoGenerator.writable;
			const backgroundImageVideoGeneratorWritable =
				backgroundImageVideoGenerator.writable;
			const backgroundVideoGeneratorWritable =
				backgroundVideoGenerator.writable;
			const backgroundWithForegroundOverlayColorVideoGeneratorWritable =
				backgroundWithForegroundOverlayColorVideoGenerator.writable;
			const foregroundOverlayColorVideoGeneratorWritable =
				foregroundOverlayColorVideoGenerator.writable;
			const foregroundVideoGeneratorWritable =
				foregroundVideoGenerator.writable;
			const foregroundWithBackgroundColorVideoGeneratorWritable =
				foregroundWithBackgroundColorVideoGenerator.writable;
			const foregroundWithBackgroundImageVideoGeneratorWritable =
				foregroundWithBackgroundImageVideoGenerator.writable;
			const maskVideoGeneratorWritable = maskVideoGenerator.writable;
			const mixedVideoGeneratorWritable = mixedVideoGenerator.writable;
			const normalVideoGeneratorWritable = normalVideoGenerator.writable;

			// Read, process and write video frames.
			const processVideoFramesArg = {
				backgroundColorVideoGeneratorWritable,
				backgroundImageVideoGeneratorWritable,
				backgroundVideoGeneratorWritable,
				backgroundWithForegroundOverlayColorVideoGeneratorWritable,
				foregroundOverlayColorVideoGeneratorWritable,
				foregroundVideoGeneratorWritable,
				foregroundWithBackgroundColorVideoGeneratorWritable,
				foregroundWithBackgroundImageVideoGeneratorWritable,
				inputStates,
				maskVideoGeneratorWritable,
				mixedVideoGeneratorWritable,
				normalVideoGeneratorWritable,
				videoProcessorReadable,
				videoSettings
			};
			if (useWorkerExecutionContextInput.checked) {
				const transfer = [];
				for (const [key, value] of Object.entries(processVideoFramesArg)) {
					if ((
						key.endsWith('Readable') ||
						key.endsWith('Writable')
						) && value)
						transfer.push(value);
				}
				processVideoFramesArg.inputStates = {};
				for (const [key, value] of Object.entries(inputStates))
					processVideoFramesArg.inputStates[key] = await getInputState(value, transfer);
				worker = new Worker('worker.js');
				worker.postMessage({
					name:	'processVideoFrames',
					args:	[processVideoFramesArg],
				}, transfer);
			}
			else {
				worker = null;
				await processVideoFrames(processVideoFramesArg);
				stopVideoTrackButton.click();
			}
		}
		catch (e) {
			console.log(e);
			alert(e);
		}
	});
})();
