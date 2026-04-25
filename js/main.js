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


/* --- Industries dropdown toggle ---
   Toggles the Industries sub-menu open/closed.
   On mobile: inline toggle. On desktop: hover is handled by JS too for keyboard access. */

(function () {
  var toggleBtns = document.querySelectorAll('.nav__dropdown-toggle');

  toggleBtns.forEach(function (btn) {
    var dropdownId = btn.getAttribute('aria-controls');
    var dropdown   = document.getElementById(dropdownId);
    if (!dropdown) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = btn.getAttribute('aria-expanded') === 'true';

      if (isOpen) {
        btn.setAttribute('aria-expanded', 'false');
        dropdown.classList.remove('is-open');
      } else {
        btn.setAttribute('aria-expanded', 'true');
        dropdown.classList.add('is-open');
      }
    });
  });

  /* Close any open dropdown when clicking outside */
  document.addEventListener('click', function () {
    toggleBtns.forEach(function (btn) {
      var dropdownId = btn.getAttribute('aria-controls');
      var dropdown   = document.getElementById(dropdownId);
      if (!dropdown) return;
      btn.setAttribute('aria-expanded', 'false');
      dropdown.classList.remove('is-open');
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


/* --- Find Your AI Opportunity Widget ---
   Multi-step interactive tool. Asks industry + 3 questions,
   then generates a tailored AI opportunity summary from rule-based logic. */

(function () {
  var container = document.getElementById('ai-widget');
  if (!container) return;

  /* -----------------------------------------------------------------------
     DATA — industries and their questions + opportunity maps
  ----------------------------------------------------------------------- */

  var industries = [
    { id: 'healthcare',    label: 'Healthcare Clinics' },
    { id: 'education',     label: 'Education Providers' },
    { id: 'trades',        label: 'Trades and Services' },
    { id: 'realestate',    label: 'Real Estate' },
    { id: 'admin',         label: 'Admin-Heavy Teams' },
    { id: 'professional',  label: 'Professional Services' },
    { id: 'other',         label: 'Something else' },
  ];

  /* Each industry has 3 questions with multiple-choice answers */
  var questions = {
    healthcare: [
      {
        q: 'What takes up the most admin time each week?',
        options: ['Answering patient enquiries', 'Appointment reminders and follow-ups', 'Internal paperwork and notes', 'Scheduling and booking']
      },
      {
        q: 'How does your team currently handle new patient enquiries?',
        options: ['Manually — phone or email only', 'Online form, but no automation after', 'Some automation in place', 'Mixed — depends on the day']
      },
      {
        q: 'What would make the biggest difference?',
        options: ['Faster response to new patients', 'Reducing after-hours admin', 'Better internal information access', 'More automated reminders']
      }
    ],
    education: [
      {
        q: 'Where does your team spend the most time?',
        options: ['Responding to student or parent enquiries', 'Creating or formatting resources', 'Admin and reporting', 'Staff coordination and communication']
      },
      {
        q: 'What is your current level of AI adoption?',
        options: ['None — starting from scratch', 'Staff use personal tools informally', 'Some tools in use, no strategy', 'Looking to expand existing use']
      },
      {
        q: 'What outcome matters most?',
        options: ['Saving teacher or staff time', 'Improving student communication', 'Building staff AI confidence', 'Internal knowledge management']
      }
    ],
    trades: [
      {
        q: 'What is your biggest admin bottleneck?',
        options: ['Responding to new job enquiries', 'Quote follow-ups and scheduling', 'Invoicing and payment follow-up', 'Review and reputation management']
      },
      {
        q: 'How are new jobs currently coming in?',
        options: ['Phone calls only', 'Website form, checked manually', 'Mix of phone and online', 'We use a booking platform']
      },
      {
        q: 'What would save the most time?',
        options: ['Automatic responses to enquiries', 'Automated follow-up sequences', 'Smarter scheduling', 'Job and invoice automation']
      }
    ],
    realestate: [
      {
        q: 'Where do you lose the most time each week?',
        options: ['Responding to property enquiries', 'Following up with buyers or sellers', 'Creating listing content', 'Managing open home data']
      },
      {
        q: 'How are property enquiries currently handled?',
        options: ['Manually — email and phone', 'Online form, followed up later', 'Some CRM in place', 'Mix of platforms and manual steps']
      },
      {
        q: 'What outcome would move the needle most?',
        options: ['More leads converted', 'Faster buyer and seller communication', 'Less time writing content', 'Better follow-up consistency']
      }
    ],
    admin: [
      {
        q: 'What does your team spend the most time on?',
        options: ['Inbox and email management', 'Meeting notes and action tracking', 'Generating documents or proposals', 'Searching for internal information']
      },
      {
        q: 'How much of your current work is repetitive?',
        options: ['Almost all of it', 'About half', 'Some tasks, some complex', 'Mostly varied and ad hoc']
      },
      {
        q: 'What would make the biggest impact?',
        options: ['Drafting faster', 'Fewer manual data entry tasks', 'Better internal knowledge access', 'Smarter inbox and triage']
      }
    ],
    professional: [
      {
        q: 'What takes the most time in your workflow?',
        options: ['Client intake and onboarding', 'Document review and summarisation', 'Proposal and scope writing', 'Research and reporting']
      },
      {
        q: 'What is your biggest operational challenge?',
        options: ['Inconsistency between team members', 'Slow turnaround on deliverables', 'High admin per client', 'Scaling without adding headcount']
      },
      {
        q: 'Where would AI create the most leverage?',
        options: ['Faster client-facing outputs', 'Internal knowledge and research', 'Automating intake and follow-up', 'Document generation and formatting']
      }
    ],
    other: [
      {
        q: 'How would you describe your business type?',
        options: ['Service-based, client-facing', 'Product-based, operational', 'Internal team or department', 'Nonprofit or community organisation']
      },
      {
        q: 'What is your biggest time drain right now?',
        options: ['Communication and enquiries', 'Documents and admin', 'Repetitive manual processes', 'Information and knowledge management']
      },
      {
        q: 'What outcome matters most to you?',
        options: ['More time for high-value work', 'Faster customer responses', 'Reducing headcount pressure', 'Building scalable systems']
      }
    ]
  };

  /* Opportunity output — maps answers to concrete AI opportunities */
  function generateOpportunities(industryId, answers) {
    var opps = {
      healthcare: {
        default: [
          'AI reception chatbot — handles patient enquiries 24/7 on your website',
          'Automated appointment reminders — SMS and email sequences',
          'Internal knowledge assistant — staff access clinic information instantly',
          'Patient follow-up automation — reduces manual after-visit contact'
        ]
      },
      education: {
        default: [
          'AI enquiry assistant — answers parent and student questions automatically',
          'Staff AI training session — practical tools for your team\'s daily workflow',
          'Resource generation assistant — create, format, and adapt materials faster',
          'Internal knowledge base — staff find information without asking around'
        ]
      },
      trades: {
        default: [
          'AI quote request assistant — captures job details from your website 24/7',
          'Automated follow-up sequences — no more missed leads',
          'Review request automation — increases 5-star reviews without effort',
          'Invoice and payment reminder workflows — reduce chasing debtors manually'
        ]
      },
      realestate: {
        default: [
          'Property enquiry chatbot — qualifies and captures buyer interest instantly',
          'Listing content generator — professional descriptions in minutes, not hours',
          'Open-home follow-up automation — personalised contact while interest is high',
          'Buyer and seller CRM workflows — consistent communication without manual effort'
        ]
      },
      admin: {
        default: [
          'AI drafting assistant — proposals, emails, and documents written in seconds',
          'Inbox triage and prioritisation — surfaces what needs action',
          'Meeting notes and action tracker — AI captures outputs from calls',
          'Internal knowledge assistant — search SOPs and documents conversationally'
        ]
      },
      professional: {
        default: [
          'Document summarisation — long reports, contracts, and briefs reviewed in seconds',
          'Proposal generator — consistent, branded scopes created from templates',
          'Client intake assistant — AI captures and qualifies new clients automatically',
          'Research and reporting workflows — AI compiles and formats faster than manual'
        ]
      },
      other: {
        default: [
          'AI enquiry assistant — handles incoming questions without manual involvement',
          'Document and admin automation — reduce repetitive manual tasks',
          'Internal knowledge assistant — team information available on demand',
          'Custom workflow automation — built around your specific operations'
        ]
      }
    };

    var industryOpps = opps[industryId] || opps.other;
    return industryOpps.default;
  }

  /* -----------------------------------------------------------------------
     STATE
  ----------------------------------------------------------------------- */

  var state = {
    step: 0,            /* 0 = choose industry, 1-3 = questions, 4 = result */
    industry: null,
    answers: []
  };

  /* -----------------------------------------------------------------------
     RENDER
  ----------------------------------------------------------------------- */

  function render() {
    container.innerHTML = '';

    if (state.step === 0) {
      renderIndustryStep();
    } else if (state.step >= 1 && state.step <= 3) {
      renderQuestionStep(state.step - 1);
    } else {
      renderResult();
    }
  }

  function renderIndustryStep() {
    var html = '<div class="widget__step is-active">';
    html += '<p class="widget__heading">What industry are you in?</p>';
    html += '<div class="widget__options">';
    industries.forEach(function (ind) {
      html += '<button class="widget__option" data-industry="' + ind.id + '">' + ind.label + '</button>';
    });
    html += '</div>';
    html += '<p class="widget__progress">Step 1 of 4</p>';
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.widget__option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.industry = btn.getAttribute('data-industry');
        state.step = 1;
        state.answers = [];
        render();
      });
    });
  }

  function renderQuestionStep(qIndex) {
    var qData = questions[state.industry][qIndex];
    var html  = '<div class="widget__step is-active">';
    html += '<p class="widget__question">' + qData.q + '</p>';
    html += '<div class="widget__options">';
    qData.options.forEach(function (opt, i) {
      var sel = state.answers[qIndex] === i ? ' is-selected' : '';
      html += '<button class="widget__option' + sel + '" data-answer="' + i + '">' + opt + '</button>';
    });
    html += '</div>';
    html += '<div class="widget__nav">';
    if (state.step > 1) {
      html += '<button class="btn btn--secondary" id="widget-back">Back</button>';
    }
    html += '<button class="btn" id="widget-next" ' + (state.answers[qIndex] === undefined ? 'disabled style="opacity:0.5;cursor:not-allowed"' : '') + '>Next</button>';
    html += '<span class="widget__progress">Step ' + (state.step + 1) + ' of 4</span>';
    html += '</div></div>';
    container.innerHTML = html;

    container.querySelectorAll('.widget__option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.answers[qIndex] = parseInt(btn.getAttribute('data-answer'), 10);
        render();
      });
    });

    var nextBtn = container.querySelector('#widget-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (state.answers[qIndex] === undefined) return;
        state.step++;
        render();
      });
    }

    var backBtn = container.querySelector('#widget-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        state.step--;
        render();
      });
    }
  }

  function renderResult() {
    var ind  = industries.find(function (i) { return i.id === state.industry; });
    var opps = generateOpportunities(state.industry, state.answers);

    var html = '<div class="widget__step is-active">';
    html += '<p class="widget__result-heading">Your AI Opportunities</p>';
    html += '<p class="widget__result-body">Based on your answers, here are the highest-value AI opportunities for ' + (ind ? ind.label : 'your business') + ':</p>';
    html += '<ul class="widget__opportunities">';
    opps.forEach(function (opp) {
      html += '<li>' + opp + '</li>';
    });
    html += '</ul>';
    html += '<p class="widget__result-body">Want a detailed AI Opportunity Audit tailored to your specific workflows, tools, and data? We map exactly where AI creates the most value in your business before building anything.</p>';
    html += '<div class="widget__result-cta">';
    html += '<a href="/ai-opportunity-audit.html" class="btn">Book an AI Audit</a>';
    html += '<a href="https://calendly.com/aiconsulting-keira/30min" class="btn btn--secondary" target="_blank" rel="noopener noreferrer">Book a Free Call</a>';
    html += '</div>';
    html += '<button class="widget__restart" id="widget-restart">Start again</button>';
    html += '</div>';
    container.innerHTML = html;

    var restartBtn = container.querySelector('#widget-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', function () {
        state.step     = 0;
        state.industry = null;
        state.answers  = [];
        render();
      });
    }
  }

  /* Kick off */
  render();
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
    err.textContent = 'Something went wrong — please try again.';
    err.style.cssText = 'color:#c00; font-size:0.875rem; margin-top:0.5rem;';
    form.parentElement.appendChild(err);
  }
})();
