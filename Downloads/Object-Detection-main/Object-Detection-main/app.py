# app.py
import streamlit as st
import cv2
import numpy as np
from streamlit_webrtc import webrtc_streamer
import av

# Use a cache to load the model only once for better performance
@st.cache_resource
@st.cache_resource
def load_model():
    """Loads the object detection model and class names."""
    try:
        # These filenames must exactly match the files in your folder
        pbtxt_file = 'ssd_mobilenet_v2_coco_2018_03_29.pbtxt'
        pb_file = 'frozen_inference_graph.pb'
        net = cv2.dnn.readNetFromTensorflow(pb_file, pbtxt_file)
        
        with open('coco.names', 'r') as f:
            class_names = f.read().splitlines()
        return net, class_names
    except cv2.error as e:
        st.error(f"Failed to load model files. Please check file paths. Error: {e}")
        return None, None

net, class_names = load_model()
def detect_objects(image_np, network, classes):
    """Takes an image, runs detection, and returns the image with boxes drawn."""
    if network is None:
        st.warning("Model is not loaded, cannot perform detection.")
        return image_np

    h, w, _ = image_np.shape
    blob = cv2.dnn.blobFromImage(image_np, size=(300, 300), swapRB=True, crop=False)
    network.setInput(blob)
    detections = network.forward()

    # Process detections
    for i in range(detections.shape[2]):
        confidence = detections[0, 0, i, 2]
        if confidence > 0.7:  # Confidence threshold
            class_id = int(detections[0, 0, i, 1])

            # --- THIS IS THE FIX ---
            # Subtract 1 from class_id to match the list index
            # Also, check if the index is valid
            if class_id - 1 < len(classes):
                label_text = classes[class_id - 1] 
                # --- END OF FIX ---
            
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                (startX, startY, endX, endY) = box.astype("int")

                label = f"{label_text}: {confidence:.2f}"
                cv2.rectangle(image_np, (startX, startY), (endX, endY), (0, 255, 0), 2)
                cv2.putText(image_np, label, (startX, startY - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    return image_np
# This is the core function that processes video frames
def video_frame_callback(frame):
    # Convert the video frame to a NumPy array that OpenCV can use
    img = frame.to_ndarray(format="bgr24")

    # Run the object detection
    processed_img = detect_objects(img, net, class_names)

    # Convert the processed NumPy array back to a video frame
    return av.VideoFrame.from_ndarray(processed_img, format="bgr24")

# --- Streamlit Web App UI ---

st.set_page_config(layout="wide", page_title="Live Object Detection")
st.title("Live Object Detection using Webcam 📹")
st.write("Click START to activate your camera and begin real-time object detection.")

# The WebRTC component that handles the video stream
webrtc_streamer(
    key="object-detection",
    video_frame_callback=video_frame_callback,
    media_stream_constraints={"video": True, "audio": False},
    async_processing=True,
)