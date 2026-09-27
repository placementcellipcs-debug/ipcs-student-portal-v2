import { useState, useEffect } from 'react';

const Counter = ({ target, suffix = '', isDecimal = false }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const increment = target / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        start = target;
        clearInterval(timer);
      }
      setCount(start);
    }, 16);

    return () => clearInterval(timer);
  }, [target]);

  const displayCount = isDecimal ? count.toFixed(1) : Math.floor(count);

  return <span>{displayCount}{suffix}</span>;
};

export default Counter;