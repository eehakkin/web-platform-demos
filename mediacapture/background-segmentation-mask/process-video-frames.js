'use strict';
function createFakeMaskForTesting(videoSettings) {
	const canvas = new OffscreenCanvas(videoSettings.width, videoSettings.height);
	const context = canvas.getContext('2d');
	const gradient = context.createRadialGradient(
		0.5 * context.canvas.width,
		0.5 * context.canvas.height,
		0.4 * context.canvas.height,
		0.5 * context.canvas.width,
		0.5 * context.canvas.height,
		0.5 * context.canvas.height
		);
	gradient.addColorStop(0, 'white');
	gradient.addColorStop(1, 'black');
	context.fillStyle = gradient;
	context.fillRect(0, 0, context.canvas.width, context.canvas.height);
	return canvas;
}

async function maybeCreateImageBitmap(image) {
	try {
		return await createImageBitmap(image);
	}
	catch (e) {
		return null;
	}
}

async function processVideoFrames({
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
	}) {
	// Create canvases.
	const backgroundCanvas =
		new OffscreenCanvas(videoSettings.width, videoSettings.height);
	const foregroundCanvas =
		new OffscreenCanvas(videoSettings.width, videoSettings.height);
	const foregroundWithBackgroundColorCanvas =
		new OffscreenCanvas(videoSettings.width, videoSettings.height);
	const foregroundWithBackgroundImageCanvas =
		new OffscreenCanvas(videoSettings.width, videoSettings.height);

	// Get readers from readables.
	const videoProcessorReader = videoProcessorReadable.getReader();

	// Get writers from writables.
	const backgroundColorVideoGeneratorWriter =
		backgroundColorVideoGeneratorWritable.getWriter();
	const backgroundImageVideoGeneratorWriter =
		backgroundImageVideoGeneratorWritable.getWriter();
	const backgroundVideoGeneratorWriter =
		backgroundVideoGeneratorWritable.getWriter();
	const backgroundWithForegroundOverlayColorVideoGeneratorWriter =
		backgroundWithForegroundOverlayColorVideoGeneratorWritable.getWriter();
	const foregroundOverlayColorVideoGeneratorWriter =
		foregroundOverlayColorVideoGeneratorWritable.getWriter();
	const foregroundVideoGeneratorWriter =
		foregroundVideoGeneratorWritable.getWriter();
	const foregroundWithBackgroundColorVideoGeneratorWriter =
		foregroundWithBackgroundColorVideoGeneratorWritable.getWriter();
	const foregroundWithBackgroundImageVideoGeneratorWriter =
		foregroundWithBackgroundImageVideoGeneratorWritable.getWriter();
	const maskVideoGeneratorWriter =
		maskVideoGeneratorWritable.getWriter();
	const mixedVideoGeneratorWriter =
		mixedVideoGeneratorWritable.getWriter();
	const normalVideoGeneratorWriter =
		normalVideoGeneratorWritable.getWriter();

	// Read, process and write video frames.
	let backgroundImageBitmap = null;
	let backgroundImageInputFile = {};
	let maskVideoFrame = null;
	for (;;) {
		// Read a video frame.
		const {done, value} = await videoProcessorReader.read();
		if (done)
			break;
		const videoFrame = value;
		const timestamp = videoFrame.timestamp;
		const videoFrameIsMask = videoFrame.backgroundMask || false;

		if (!videoFrameIsMask && inputStates.createFakeMaskForTestingInput.checked) {
			if (maskVideoFrame)
				maskVideoFrame.close();
			maskVideoFrame = new VideoFrame(
				createFakeMaskForTesting(videoSettings),
				{timestamp}
				);
			if (inputStates.generateMixedVideoInput.checked)
				mixedVideoGeneratorWriter.write(maskVideoFrame.clone());
			if (inputStates.generateMaskVideoInput.checked)
				maskVideoGeneratorWriter.write(maskVideoFrame.clone());
		}

		if (!videoFrameIsMask && maskVideoFrame) {
			// Draw to canvases and create and write new video
			// frames.

			// Draw a foreground.
			// This is used as a source
			// for a foreground video frame,
			// for a foreground overlay color video frame,
			// for a background with a foreground overlay color video frame,
			// for a foreground with a background color video frame and
			// for a foreground with a background image video frame.
			if (inputStates.generateBackgroundWithForegroundOverlayColorVideoInput.checked ||
			    inputStates.generateForegroundOverlayColorVideoInput.checked ||
			    inputStates.generateForegroundVideoInput.checked ||
			    inputStates.generateForegroundWithBackgroundColorVideoInput.checked ||
			    inputStates.generateForegroundWithBackgroundImageVideoInput.checked) {
				const context = foregroundCanvas.getContext('2d');
				// Draw the mask video frame.
				context.globalCompositeOperation = 'copy';
				context.drawImage(maskVideoFrame, 0, 0);
				// Draw the normal video frame.
				context.globalCompositeOperation = 'multiply';
				context.drawImage(videoFrame, 0, 0);
				if (inputStates.generateForegroundVideoInput.checked) {
					// Create and write a foreground video
					// frame.
					foregroundVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp}));
				}
			}

			// Draw a background.
			// This is used as a source
			// for a background video frame and
			// for a background with a foreground overlay color video frame.
			if (inputStates.generateBackgroundVideoInput.checked ||
			    inputStates.generateBackgroundWithForegroundOverlayColorVideoInput.checked) {
				const context = backgroundCanvas.getContext('2d');
				// Invert and draw the mask video frame.
				context.globalCompositeOperation = 'copy';
				context.fillStyle = 'white';
				context.fillRect(0, 0, context.canvas.width, context.canvas.height);
				context.globalCompositeOperation = 'difference';
				context.drawImage(maskVideoFrame, 0, 0);
				// Draw the normal video frame.
				context.globalCompositeOperation = 'multiply';
				context.drawImage(videoFrame, 0, 0);
				if (inputStates.generateBackgroundVideoInput.checked) {
					// Create and write a background video
					// frame.
					backgroundVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp}));
				}
			}

			if (inputStates.generateBackgroundColorVideoInput.checked ||
			    inputStates.generateForegroundWithBackgroundColorVideoInput.checked) {
				const context = foregroundWithBackgroundColorCanvas.getContext('2d');
				// Invert and draw the mask video frame.
				context.globalCompositeOperation = 'copy';
				context.fillStyle = 'white';
				context.fillRect(0, 0, context.canvas.width, context.canvas.height);
				context.globalCompositeOperation = 'difference';
				context.drawImage(maskVideoFrame, 0, 0);
				// Draw the background color.
				context.globalCompositeOperation = 'multiply';
				context.fillStyle = inputStates.backgroundColorInput.value;
				context.fillRect(0, 0, context.canvas.width, context.canvas.height);
				if (inputStates.generateBackgroundColorVideoInput.checked) {
					// Create and write a background color
					// video frame.
					backgroundColorVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp})
						);
				}
				if (inputStates.generateForegroundWithBackgroundColorVideoInput.checked) {
					// Draw the foreground.
					context.globalCompositeOperation = 'lighter';
					context.drawImage(foregroundCanvas, 0, 0);
					// Create and write a foreground with
					// a background color video frame.
					foregroundWithBackgroundColorVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp})
						);
				}
			}

			if (inputStates.generateBackgroundImageVideoInput.checked ||
			    inputStates.generateForegroundWithBackgroundImageVideoInput.checked) {
				const newBackgroundImageInputFile =
					inputStates.backgroundImageInput.files &&
					inputStates.backgroundImageInput.files[0];
				if (backgroundImageInputFile !== newBackgroundImageInputFile) {
					backgroundImageInputFile = newBackgroundImageInputFile;
					backgroundImageBitmap = backgroundImageInputFile
						? await maybeCreateImageBitmap(backgroundImageInputFile)
						: null;
				}
				if (backgroundImageBitmap) {
					const context = foregroundWithBackgroundImageCanvas.getContext('2d');
					// Invert and draw the mask video frame.
					context.globalCompositeOperation = 'copy';
					context.fillStyle = 'white';
					context.fillRect(0, 0, context.canvas.width, context.canvas.height);
					context.globalCompositeOperation = 'difference';
					context.drawImage(maskVideoFrame, 0, 0);
					// Draw the background image.
					context.globalCompositeOperation = 'multiply';
					context.drawImage(backgroundImageBitmap, 0, 0, context.canvas.width, context.canvas.height);
					if (inputStates.generateBackgroundImageVideoInput.checked) {
						// Create and write a background
						// image video frame.
						backgroundImageVideoGeneratorWriter.write(
							new VideoFrame(context.canvas, {timestamp})
							);
					}
					if (inputStates.generateForegroundWithBackgroundImageVideoInput.checked) {
						// Draw the foreground.
						context.globalCompositeOperation = 'lighter';
						context.drawImage(foregroundCanvas, 0, 0);
						// Create and write a foreground
						// with a background image video
						// frame.
						foregroundWithBackgroundImageVideoGeneratorWriter.write(
							new VideoFrame(context.canvas, {timestamp})
							);
					}
				}
			}

			if (inputStates.generateBackgroundWithForegroundOverlayColorVideoInput.checked ||
			    inputStates.generateForegroundOverlayColorVideoInput.checked) {
				// Reuse the foreground canvas
				// which already contains the foreground on black.
				const backgroundWithForegroundOverlayColorCanvas =
					foregroundCanvas;
				const context = backgroundWithForegroundOverlayColorCanvas.getContext('2d');
				if (context.canvas !== foregroundCanvas) {
					// Draw the mask video frame.
					context.globalCompositeOperation = 'copy';
					context.drawImage(maskVideoFrame, 0, 0);
					// Draw the normal video frame.
					context.globalCompositeOperation = 'multiply';
					context.drawImage(videoFrame, 0, 0);
				}
				// Draw the foreground overlay color.
				context.globalCompositeOperation = 'multiply';
				context.fillStyle = inputStates.foregroundOverlayColorInput.value;
				context.fillRect(0, 0, context.canvas.width, context.canvas.height);
				if (inputStates.generateForegroundOverlayColorVideoInput.checked) {
					// Create and write a foreground
					// overlay color video frame.
					foregroundOverlayColorVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp})
						);
				}
				if (inputStates.generateBackgroundWithForegroundOverlayColorVideoInput.checked) {
					// Draw the background.
					context.globalCompositeOperation = 'lighter';
					context.drawImage(backgroundCanvas, 0, 0);
					// Create and write a background with
					// a foreground overlay color video
					// frame.
					backgroundWithForegroundOverlayColorVideoGeneratorWriter.write(
						new VideoFrame(context.canvas, {timestamp})
						);
				}
			}
		}

		// The same video frame cannot be written to multiple streams
		// thus calculate the need and close and clone as needed.
		const videoFrameIsMaskToBeStored = videoFrameIsMask && (
			inputStates.generateBackgroundColorVideoInput.checked ||
			inputStates.generateBackgroundImageVideoInput.checked ||
			inputStates.generateBackgroundVideoInput.checked ||
			inputStates.generateBackgroundWithForegroundOverlayColorVideoInput.checked ||
			inputStates.generateForegroundOverlayColorVideoInput.checked ||
			inputStates.generateForegroundVideoInput.checked ||
			inputStates.generateForegroundWithBackgroundColorVideoInput.checked ||
			inputStates.generateForegroundWithBackgroundImageVideoInput.checked
			);
		const neededVideoFrameCount =
			videoFrameIsMaskToBeStored +
			inputStates.generateMixedVideoInput.checked +
			(videoFrameIsMask
				? inputStates.generateMaskVideoInput.checked
				: inputStates.generateNormalVideoInput.checked);
		const videoFrames = [];
		if (neededVideoFrameCount <= 0)
			videoFrame.close();
		else {
			videoFrames.push(videoFrame);
			while (videoFrames.length < neededVideoFrameCount)
				videoFrames.push(videoFrame.clone());
		}

		// Store the mask video frame for a later use, if needed.
		if (videoFrameIsMaskToBeStored) {
			// Close a previously stored mask video frame, if any.
			if (maskVideoFrame)
				maskVideoFrame.close();
			// Store the mask video frame for a later use.
			maskVideoFrame = videoFrames.pop();
		}

		// Write the original and the cloned video frames as-is.
		if (inputStates.generateMixedVideoInput.checked)
			mixedVideoGeneratorWriter.write(videoFrames.pop());
		if (inputStates.generateMaskVideoInput.checked && videoFrameIsMask)
			maskVideoGeneratorWriter.write(videoFrames.pop());
		if (inputStates.generateNormalVideoInput.checked && !videoFrameIsMask)
			normalVideoGeneratorWriter.write(videoFrames.pop());

		console.assert(videoFrames.length == 0, 'All video frames must be consumed or closed.');
	}

	// Close the previously stored mask video frame, if any.
	if (maskVideoFrame)
		maskVideoFrame.close();
}
