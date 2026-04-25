'use strict';

/* ============================================================
   AI Consultancy — main.js
   Hamburger menu, industries dropdown, scroll animations.
   ============================================================ */

(function () {

  /* --- Hamburger nav toggle --- */
  var hamburger = document.querySelector('.nav__hamburger');
  var navLinks  = document.getElementById('nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    /* Close nav when a link is clicked */
    navLinks.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
        var openDropdown = navLinks.querySelector('.nav__dropdown.is-open');
        var openToggle   = navLinks.querySelector('.nav__dropdown-toggle[aria-expanded="true"]');
        if (openDropdown) openDropdown.classList.remove('is-open');
        if (openToggle)   openToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }


  /* --- Industries dropdown toggle (mobile) --- */
  var dropdownToggle = document.querySelector('.nav__dropdown-toggle');
  var dropdown       = document.getElementById('industries-menu');

  if (dropdownToggle && dropdown) {
    dropdownToggle.addEventListener('click', function () {
      var isOpen = dropdown.classList.toggle('is-open');
      dropdownToggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', function (e) {
      if (!dropdownToggle.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('is-open');
        dropdownToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }


  /* --- Scroll-triggered animations --- */

  /* Stagger delay for child elements */
  document.querySelectorAll('[data-stagger]').forEach(function (container) {
    Array.from(container.children).forEach(function (child, i) {
      child.style.transitionDelay = (i * 0.08) + 's';
    });
  });

  var animObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        animObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-animate], [data-fade]').forEach(function (el) {
    animObserver.observe(el);
  });

  document.querySelectorAll('[data-stagger]').forEach(function (container) {
    Array.from(container.children).forEach(function (child) {
      animObserver.observe(child);
    });
  });

}());
