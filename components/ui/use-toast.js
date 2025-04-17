'use client';

import { useState, useEffect, createContext, useContext } from 'react';

const TOAST_REMOVE_DELAY = 5000;

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
};

const toastTimeouts = new Map();

const ToastContext = createContext({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
  update: () => {},
});

function reducer(state, action) {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [...state.toasts, action.toast],
      };
    
    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    
    case actionTypes.DISMISS_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
}

export function useToast() {
  const [state, setState] = useState({
    toasts: [],
  });
  
  const dispatch = (action) => {
    setState((prevState) => reducer(prevState, action));
  };

  const toast = ({ ...props }) => {
    const id = props.id || crypto.randomUUID();
    
    const update = (props) => {
      dispatch({
        type: actionTypes.UPDATE_TOAST,
        toast: { ...props, id },
      });
    };
    
    const dismiss = () => {
      dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
    };
    
    dispatch({
      type: actionTypes.ADD_TOAST,
      toast: {
        ...props,
        id,
        open: true,
        onOpenChange: (open) => {
          if (!open) dismiss();
        },
      },
    });
    
    return {
      id,
      dismiss,
      update,
    };
  };
  
  const update = (id, props) => {
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });
  };
  
  const dismiss = (id) => {
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };
  
  useEffect(() => {
    state.toasts.forEach((toast) => {
      if (toast.open === false && !toastTimeouts.has(toast.id)) {
        const timeout = setTimeout(() => {
          toastTimeouts.delete(toast.id);
          dispatch({
            type: actionTypes.REMOVE_TOAST,
            toastId: toast.id,
          });
        }, TOAST_REMOVE_DELAY);
        
        toastTimeouts.set(toast.id, timeout);
      }
    });
  }, [state.toasts]);
  
  return {
    ...state,
    toast,
    dismiss,
    update,
  };
}

export function ToastProvider({ children }) {
  const [state, setState] = useState({
    toasts: [],
  });
  
  return (
    <ToastContext.Provider value={state}>
      {children}
    </ToastContext.Provider>
  );
}