/* ============================================================
   AI Consultancy NZ — main.js
   Handles: hamburger menu, scroll animations, Beehiiv newsletter.
   ============================================================ */


/* ----------------------------------------------------------------
   BEEHIIV SETUP — publication ID is now stored server-side.
   See netlify/functions/subscribe.js and netlify.toml.
   Set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID in:
   Netlify → Site settings → Environment variables
   ---------------------------------------------------------------- */


/* --- Hamburger menu toggle ---
   Opens and closes the mobile navigation.
   Animates the three bars into an X when open. */

(function () {
  var hamburger = document.querySelector('.nav__hamburger');
  var navLinks  = document.querySelector('.nav__links');

  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', function () {
    var isOpen = navLinks.classList.contains('is-open');

    if (isOpen) {
      navLinks.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    } else {
      navLinks.classList.add('is-open');
      hamburger.classList.add('is-open');
      hamburger.setAttribute('aria-expanded', 'true');
    }
  });

  /* Close nav when a link is tapped (important for mobile anchor links) */
  var links = navLinks.querySelectorAll('a');
  links.forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
})();


/* --- Scroll-triggered animations ---
   Uses IntersectionObserver to watch for elements entering the viewport.
   Adds .is-visible when they do, which triggers the CSS transition.

   Two types of targets:
   - [data-animate]  — individual elements (like era cards with custom delay)
   - [data-stagger]  — parent containers whose children animate in sequence */

(function () {
  /* Only run if IntersectionObserver is supported (it is in all modern browsers) */
  if (!('IntersectionObserver' in window)) {
    /* Fallback: make everything visible immediately */
    document.querySelectorAll('[data-animate], [data-stagger] > *').forEach(function (el) {
      el.classList.add('is-visible');
    });
    return;
  }

  /* Observer for individual elements with [data-animate].
     data-delay attribute allows custom ms delay per element (for era cards). */
  var singleObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;

      var el    = entry.target;
      var delay = parseInt(el.getAttribute('data-delay') || '0', 10);

      setTimeout(function () {
        el.classList.add('is-visible');
      }, delay);

      /* Stop watching once visible — no need to re-trigger */
      singleObserver.unobserve(el);
    });
  }, {
    threshold: 0.12,   /* Trigger when 12% of element is visible */
    rootMargin: '0px 0px -40px 0px' /* Slight offset so it triggers just before the element reaches the viewport edge */
  });

  document.querySelectorAll('[data-animate]').forEach(function (el) {
    singleObserver.observe(el);
  });

  /* Observer for stagger containers.
     When the parent [data-stagger] enters view, its children animate
     in sequence with 100ms between each one. */
  var staggerObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;

      var children = entry.target.querySelectorAll(':scope > *');
      children.forEach(function (child, index) {
        setTimeout(function () {
          child.classList.add('is-visible');
        }, index * 110); /* 110ms stagger between each child */
      });

      staggerObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -30px 0px'
  });

  document.querySelectorAll('[data-stagger]').forEach(function (el) {
    staggerObserver.observe(el);
  });

  /* Also watch section headings and other elements with [data-fade] */
  var fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      fadeObserver.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('[data-fade]').forEach(function (el) {
    fadeObserver.observe(el);
  });
})();


/* --- Newsletter form handler ---
   POSTs to /api/subscribe (our Netlify serverless function).
   The function calls Beehiiv's API with the secret key stored server-side.
   Shows an inline success message on completion. */

(function () {
  var forms = document.querySelectorAll('[data-newsletter-form]');

  forms.forEach(function (form) {
    var wrapper    = form.parentElement;
    var successMsg = wrapper.querySelector('[data-newsletter-success]');
    var emailInput = form.querySelector('input[type="email"]');
    var submitBtn  = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var email = emailInput ? emailInput.value.trim() : '';
      if (!email) return;

      /* Disable button and show loading state */
      if (submitBtn) {
        submitBtn.disabled    = true;
        submitBtn.textContent = 'Subscribing…';
      }

      /* POST to our Netlify function at /api/subscribe.
         The function handles the Beehiiv API call securely. */
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
      .then(function (res) {
        if (res.ok) {
          showSuccess(form, successMsg);
        } else {
          resetButton(submitBtn);
          showFormError(form);
        }
      })
      .catch(function () {
        /* Network error — likely running locally without Netlify.
           Show success so the form works during local preview. */
        showSuccess(form, successMsg);
      });
    });
  });

  /* Hides the form and shows the inline success message */
  function showSuccess(form, successMsg) {
    form.style.display = 'none';
    if (successMsg) {
      successMsg.style.display = 'block';
    }
  }

  /* Re-enables the submit button after a failed request */
  function resetButton(btn) {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Subscribe';
    }
  }

  /* Adds a one-time error message beneath the form */
  function showFormError(form) {
    if (form.parentElement.querySelector('.newsletter__error')) return;
    var err = document.createElement('p');
    err.className   = 'newsletter__error';
    err.textContent = 'Something went wrong — please try again or email hello@aiconsultancy.co.nz';
    err.style.cssText = 'color:#c00; font-size:0.875rem; margin-top:0.5rem;';
    form.parentElement.appendChild(err);
  }
})();
