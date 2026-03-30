// Speed Insights initialization for static HTML site
// This script loads the Speed Insights tracking from the npm package

(function() {
  'use strict';
  
  // Create and inject the Speed Insights script
  const script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  
  // Initialize the Speed Insights queue
  window.si = window.si || function() {
    (window.siq = window.siq || []).push(arguments);
  };
  
  // Append script to document head
  if (document.head) {
    document.head.appendChild(script);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(script);
    });
  }
})();
