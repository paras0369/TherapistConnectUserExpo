// src/store/index.js
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import callReducer from "./callSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    call: callReducer,
  },
});
