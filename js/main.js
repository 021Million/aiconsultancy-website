/* ============================================================
   AI Consultancy NZ — main.js
   Handles: hamburger menu, scroll animations, Beehiiv newsletter.
   ============================================================ */


/* ----------------------------------------------------------------
   BEEHIIV SETUP
   ----------------------------------------------------------------
   1. Go to app.beehiiv.com
   2. Settings → Publication Details → copy your Publication ID
      (it looks like: pub_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
   3. Paste it below, replacing YOUR_PUBLICATION_ID
   ---------------------------------------------------------------- */
var BEEHIIV_PUBLICATION_ID = 'YOUR_PUBLICATION_ID';


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


/* --- Beehiiv newsletter form handler ---
   Submits email to Beehiiv via their public embed API.
   Shows an inline success message on completion.
   Falls back to a visible error message if the request fails. */

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

      /* If no publication ID has been set yet, show a helpful warning in the console
         and still show the success state so the site functions during development */
      if (BEEHIIV_PUBLICATION_ID === 'YOUR_PUBLICATION_ID') {
        console.warn(
          'Beehiiv not connected yet. ' +
          'Replace YOUR_PUBLICATION_ID in js/main.js with your Beehiiv Publication ID.'
        );
        showSuccess(form, successMsg);
        return;
      }

      /* Disable button and show loading state while the request is in flight */
      if (submitBtn) {
        submitBtn.disabled    = true;
        submitBtn.textContent = 'Subscribing…';
      }

      /* Post the email to Beehiiv's public embed subscription endpoint */
      fetch('https://api.beehiiv.com/v2/publications/' + BEEHIIV_PUBLICATION_ID + '/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          reactivate_existing: false,
          send_welcome_email: true
        })
      })
      .then(function (res) {
        /* Beehiiv returns 200 or 201 on success */
        if (res.ok || res.status === 201) {
          showSuccess(form, successMsg);
        } else {
          showError(form, submitBtn);
        }
      })
      .catch(function () {
        /* Network error or CORS issue — show error state */
        showError(form, submitBtn);
      });
    });
  });

  /* Shows the inline success message and hides the form */
  function showSuccess(form, successMsg) {
    form.style.display = 'none';
    if (successMsg) {
      successMsg.style.display = 'block';
    }
  }

  /* Re-enables the form if something goes wrong */
  function showError(form, btn) {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Subscribe';
    }
    /* Add a simple error message beneath the form */
    var existing = form.parentElement.querySelector('.newsletter__error');
    if (!existing) {
      var err = document.createElement('p');
      err.className   = 'newsletter__error';
      err.textContent = 'Something went wrong. Please try again or email hello@aiconsultancy.co.nz directly.';
      err.style.cssText = 'color:#c00; font-size:0.875rem; margin-top:0.5rem;';
      form.parentElement.appendChild(err);
    }
  }
})();
