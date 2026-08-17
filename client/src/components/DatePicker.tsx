'use client';

import React, { forwardRef } from 'react';
import ReactDatePicker, { DatePickerProps as ReactDatePickerProps } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';

interface CustomDatePickerProps extends Omit<ReactDatePickerProps, 'onChange' | 'value'> {
  value?: string | Date;
  onChange?: (date: string) => void;
  className?: string;
  placeholder?: string;
}

const DatePicker = forwardRef<any, CustomDatePickerProps>(
  ({ value, onChange, className = '', placeholder = 'Select date', ...props }, ref) => {
    let parsedDate: Date | null = null;
    if (value) {
      if (value instanceof Date) {
        parsedDate = value;
      } else if (typeof value === 'string') {
        const parts = value.split('-');
        if (parts.length >= 3) {
           parsedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].slice(0,2)));
        } else {
          const d = new Date(value);
          if (!isNaN(d.getTime())) parsedDate = d;
        }
      }
    }

    const handleChange = (date: Date | null) => {
      if (onChange) {
        if (date) {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          onChange(`${yyyy}-${mm}-${dd}`);
        } else {
          onChange('');
        }
      }
    };

    return (
      <div className="relative group w-full">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors pointer-events-none z-10">
          <Calendar size={18} />
        </div>
        <ReactDatePicker
          ref={ref}
          selected={parsedDate}
          onChange={(date: any) => handleChange(date)}
          className={`w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all cursor-pointer ${className}`}
          placeholderText={placeholder}
          dateFormat="MMM dd, yyyy"
          autoComplete="off"
          {...(props as any)}
        />
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
export default DatePicker;
