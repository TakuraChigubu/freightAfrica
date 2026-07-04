import React, { InputHTMLAttributes, forwardRef } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className={`input-group ${error ? 'input-group--error' : ''} ${className}`}>
        {label && (
          <label htmlFor={inputId} className="input-group__label">
            {label}
            {props.required && <span className="input-group__required">*</span>}
          </label>
        )}
        <div className="input-group__wrapper">
          {leftIcon && <span className="input-group__icon input-group__icon--left">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            className="input-group__input"
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {rightIcon && <span className="input-group__icon input-group__icon--right">{rightIcon}</span>}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="input-group__error" role="alert">
            {error}
          </p>
        )}
        {hint && !error && <p id={`${inputId}-hint`} className="input-group__hint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
