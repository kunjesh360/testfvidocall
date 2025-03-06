import React, { useEffect, useCallback, useState,useRef } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useNavigate } from "react-router-dom";
import RecordRTC from "recordrtc";
import axios from "axios";

import { useSocket } from "../context/SocketProvider";

const RoomPage = () => {
  const socket = useSocket();
    const navigate = useNavigate();
  
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const offer = await peer.getOffer();
    socket.emit("user:call", { to: remoteSocketId, offer });
    setMyStream(stream);
  }, [remoteSocketId, socket]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMyStream(stream);
      console.log('Incoming Call', from, offer);
      const ans = await peer.getAnswer(offer);
      socket.emit("call:accepted", { to: from, ans });
    },
    [socket]
  );

  const sendStreams = useCallback(() => {
    for (const track of myStream.getTracks()) {
      peer.peer.addTrack(track, myStream);
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    ({ from, ans }) => {
      peer.setLocalDescription(ans);
      console.log("Call Accepted!");
      sendStreams();
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ ans }) => {
    await peer.setLocalDescription(ans);
  }, []);

  useEffect(() => {
    peer.peer.addEventListener("track", async (ev) => {
      const remoteStream = ev.streams;
      console.log("GOT TRACKS!!");
      setRemoteStream(remoteStream[0]);
    });
  }, []);


  const handleEndCall = useCallback(() => {
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop()); // Stop local media tracks
      setMyStream(null); // Clear local stream
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop()); // Stop remote media tracks
      setRemoteStream(null); // Clear remote stream
    }
    peer.peer.close(); // Close the peer connection
    socket.emit("call:ended", { to: remoteSocketId }); // Notify remote user
    setRemoteSocketId(null); // Reset remote user state
    navigate("/");
  }, [myStream, remoteStream, remoteSocketId, socket]);


  useEffect(() => {
    socket.on("call:ended", () => {
      if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        setRemoteStream(null);
      }
      peer.peer.close();
      setRemoteSocketId(null);
    });
  
    return () => {
      socket.off("call:ended");
    };
  }, [socket, remoteStream]);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
    };
  }, [
    socket,
    handleUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
  ]);

  const [recording, setRecording] = useState(false);
  const [videoURL, setVideoURL] = useState(null);
  // const recorderRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
    const startRecording = async () => {
    try {
      // Capture current screen (video + audio)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true, // Captures microphone audio
      });
      const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();
streamRef.current = stream;

// Process local audio
const localAudioSource = audioContext.createMediaStreamSource(stream);
localAudioSource.connect(destination);

// Process remote audio
const remoteAudioSource = audioContext.createMediaStreamSource(remoteStream);
remoteAudioSource.connect(destination);

// Create a new stream with merged audio
const mixedStream = new MediaStream();
destination.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

// Record the merged audio
recorderRef.current = new RecordRTC(mixedStream, { type: "audio" });
recorderRef.current.startRecording();
      // streamRef.current = stream;
      
      // recorderRef.current = new RecordRTC(stream, {
      //   type: "video",
      //   mimeType: "video/webm",
      // });

      // recorderRef.current.startRecording();
      setRecording(true);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };
  
  

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stopRecording(async () => {
        const blob = recorderRef.current?.getBlob();
        if (blob) {
          const file = new File([blob], "recorded-video.webm", { type: "video/webm" });
  
          // Upload to Cloudinary
          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", "kunjesh"); // Replace with your Cloudinary Upload Preset
          formData.append("cloud_name", "dp2a3z6fu"); // Replace with your Cloudinary Cloud Name
  
          try {
            const response = await axios.post(
              `https://api.cloudinary.com/v1_1/dp2a3z6fu/video/upload`, 
              formData
            );
  
            console.log("Uploaded video URL:", response.data.secure_url);
            setVideoURL(response.data.secure_url); // Store Cloudinary URL in state
          } catch (error) {
            console.log("kunj",error);
            console.error("Cloudinary Upload Failed:", error.response?.data || error.message);

            console.error("Upload failed:", error);
          }
        }
      });
    }
  
    // Stop the stream and release resources
    streamRef.current?.getTracks().forEach(track => track.stop());
  setRecording(false);
  };

  return (
    <div>
      <h1>Room Page</h1>
      <h4>{remoteSocketId ? "Connected" : "No one in room"}</h4>
      {myStream && <button onClick={sendStreams}>Send Stream</button>}
      {remoteSocketId && <button onClick={handleCallUser}>CALL</button>}
      {myStream && (
        <>
          <h1>My Stream</h1>
          <ReactPlayer
            playing
            muted
            height="100px"
            width="200px"
            url={myStream}
          />
        </>
      )}
      {remoteStream && (
        <>
          <h1>Remote Stream</h1>
          <ReactPlayer
            playing
            muted
            height="100px"
            width="200px"
            url={remoteStream}
          />
        </>
      )}
      {myStream && (
  <button onClick={handleEndCall} style={{ backgroundColor: "red", color: "white" }}>
    End Call
  </button>
)}

<div>
      <h1>Screen Recorder</h1>
      <button onClick={startRecording} disabled={recording}>
        Start Recording
      </button>
      <button onClick={stopRecording} disabled={!recording}>
        Stop Recording
      </button>
      {videoURL && <video src={videoURL} controls />}
    </div>
    </div>
  );
};

export default RoomPage;
