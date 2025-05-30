// src/store/callSlice.js
import { createSlice } from "@reduxjs/toolkit";

const callSlice = createSlice({
  name: "call",
  initialState: {
    activeCall: null,
    incomingCall: null,
    callStatus: null,
  },
  reducers: {
    setActiveCall: (state, action) => {
      state.activeCall = action.payload;
    },
    setIncomingCall: (state, action) => {
      state.incomingCall = action.payload;
    },
    setCallStatus: (state, action) => {
      state.callStatus = action.payload;
    },
    clearCall: (state) => {
      state.activeCall = null;
      state.incomingCall = null;
      state.callStatus = null;
    },
  },
});

export const { setActiveCall, setIncomingCall, setCallStatus, clearCall } =
  callSlice.actions;
export default callSlice.reducer;
