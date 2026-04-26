'use strict';

(function () {

  /* ============================================================
     NAV: hamburger toggle
     ============================================================ */
  var hamburger = document.querySelector('.nav__hamburger');
  var navLinks  = document.getElementById('nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

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


  /* ============================================================
     NAV: industries dropdown
     ============================================================ */
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


  /* ============================================================
     SCROLL ANIMATIONS: stagger delays + IntersectionObserver
     ============================================================ */
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


  /* ============================================================
     HERO WORKFLOW PANEL: cycle steps through active → done states
     ============================================================ */
  var steps = Array.from(document.querySelectorAll('[data-ws]'));
  var stateLabels = ['Just now', 'In progress...', 'In progress...', 'Generating...', 'Generating...'];
  var doneLabels  = ['Received', 'Drafted', 'Sent', 'Ready', 'Created'];

  if (steps.length) {
    var currentStep = 0;

    function advanceStep() {
      if (currentStep < steps.length) {
        var step = steps[currentStep];
        var stateEl = step.querySelector('.workflow-step__state');

        /* Mark previous as done, current as active */
        if (currentStep > 0) {
          steps[currentStep - 1].classList.remove('is-active');
          steps[currentStep - 1].classList.add('is-done');
          if (steps[currentStep - 1].querySelector('.workflow-step__state')) {
            steps[currentStep - 1].querySelector('.workflow-step__state').textContent = doneLabels[currentStep - 1];
          }
        }

        step.classList.add('is-active');
        if (stateEl) stateEl.textContent = stateLabels[currentStep];
        currentStep++;
      } else {
        /* All done — pause, then reset */
        /* Mark last step done */
        steps[steps.length - 1].classList.remove('is-active');
        steps[steps.length - 1].classList.add('is-done');
        if (steps[steps.length - 1].querySelector('.workflow-step__state')) {
          steps[steps.length - 1].querySelector('.workflow-step__state').textContent = doneLabels[steps.length - 1];
        }

        setTimeout(function () {
          steps.forEach(function (s, i) {
            s.classList.remove('is-active', 'is-done');
            var stateEl = s.querySelector('.workflow-step__state');
            if (stateEl) stateEl.textContent = i === 0 ? 'Waiting' : 'Pending';
          });
          currentStep = 0;
        }, 2500);
      }
    }

    /* Start cycling: advance one step every 1.8 seconds */
    setInterval(advanceStep, 1800);
    /* Kick off first step after a short delay */
    setTimeout(advanceStep, 800);
  }


  /* ============================================================
     FLIP CARDS: click + keyboard toggle
     ============================================================ */
  document.querySelectorAll('.flip-card').forEach(function (card) {
    function toggleFlip() {
      var isFlipped = card.classList.toggle('is-flipped');
      card.setAttribute('aria-pressed', String(isFlipped));
    }

    card.addEventListener('click', toggleFlip);

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleFlip();
      }
    });
  });


  /* ============================================================
     WORKFLOW FLOW: light up nodes sequentially on scroll
     ============================================================ */
  var flowSection = document.getElementById('workflowFlow');

  if (flowSection) {
    var wfNodes      = Array.from(flowSection.querySelectorAll('[data-wf-node]'));
    var wfConnectors = Array.from(flowSection.querySelectorAll('[data-wf-connector]'));
    var flowFired    = false;

    function lightUpFlow() {
      if (flowFired) return;
      flowFired = true;

      wfNodes.forEach(function (node, i) {
        setTimeout(function () {
          node.classList.add('is-lit');
          if (wfConnectors[i]) {
            setTimeout(function () {
              wfConnectors[i].classList.add('is-lit');
            }, 300);
          }
        }, i * 700);
      });
    }

    var flowObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          lightUpFlow();
          flowObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    flowObserver.observe(flowSection);
  }


  /* ============================================================
     ERAS EVOLUTION: activate items + fill line on scroll
     ============================================================ */
  var evoStrip = document.getElementById('evoStrip');
  var evoFill  = document.getElementById('evoFill');
  var evoItems = Array.from(document.querySelectorAll('[data-evo-item]'));

  if (evoStrip && evoItems.length) {
    /* Activate each item via IntersectionObserver */
    var evoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-active');
        }
      });
    }, { threshold: 0.5 });

    evoItems.forEach(function (item) { evoObserver.observe(item); });

    /* Fill the connecting line proportionally as the section scrolls into view */
    if (evoFill) {
      function updateEvoFill() {
        var rect   = evoStrip.getBoundingClientRect();
        var vh     = window.innerHeight;
        /* progress: 0 when strip top hits bottom of viewport, 1 when strip bottom hits top */
        var progress = 1 - (rect.bottom / (vh + rect.height));
        progress = Math.max(0, Math.min(1, progress));
        evoFill.style.width = (progress * 100) + '%';
      }
      window.addEventListener('scroll', updateEvoFill, { passive: true });
      updateEvoFill();
    }
  }


  /* ============================================================
     FAQ ACCORDION: click to expand / collapse
     ============================================================ */
  document.querySelectorAll('.faq-item__trigger').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var bodyId = trigger.getAttribute('aria-controls');
      var body   = document.getElementById(bodyId);
      var isOpen = trigger.getAttribute('aria-expanded') === 'true';

      /* Close all other items */
      document.querySelectorAll('.faq-item__trigger').forEach(function (t) {
        if (t !== trigger) {
          t.setAttribute('aria-expanded', 'false');
          var otherBodyId = t.getAttribute('aria-controls');
          var otherBody   = document.getElementById(otherBodyId);
          if (otherBody) otherBody.style.maxHeight = '0';
        }
      });

      /* Toggle this item */
      if (isOpen) {
        trigger.setAttribute('aria-expanded', 'false');
        body.style.maxHeight = '0';
      } else {
        trigger.setAttribute('aria-expanded', 'true');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });

}());


/* ============================================================
   CHAT WIDGET
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
(function () {
  var widget   = document.getElementById('chatWidget');
  var toggle   = document.getElementById('chatToggle');
  var panel    = document.getElementById('chatPanel');
  var messages = document.getElementById('chatMessages');
  var input    = document.getElementById('chatInput');
  var sendBtn  = document.getElementById('chatSend');
  var closeBtn = document.getElementById('chatClose');

  if (!widget || !toggle) return;

  /* Session ID — persists for the browser tab, resets on new visit */
  var sessionId = sessionStorage.getItem('chat_session_id');
  if (!sessionId) {
    sessionId = 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem('chat_session_id', sessionId);
  }

  var history = [];
  var isOpen  = false;
  var loading = false;

  function openChat() {
    isOpen = true;
    widget.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('aria-hidden');
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    widget.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  }

  toggle.addEventListener('click', function () { isOpen ? closeChat() : openChat(); });
  if (closeBtn) closeBtn.addEventListener('click', closeChat);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function addMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'chat-msg chat-msg--' + (role === 'user' ? 'user' : 'bot');
    el.innerHTML = '<p>' + escapeHtml(text) + '</p>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'chat-typing';
    el.id = 'chatTyping';
    el.innerHTML = '<div class="chat-typing__dot"></div><div class="chat-typing__dot"></div><div class="chat-typing__dot"></div>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('chatTyping');
    if (el) el.remove();
  }

  function setLoading(state) {
    loading = state;
    sendBtn.disabled = state;
  }

  async function sendMessage() {
    var text = input.value.trim();
    if (!text || loading) return;

    input.value = '';
    addMessage('user', text);
    showTyping();
    setLoading(true);

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId,
          history: history,
          pageUrl: window.location.href,
        }),
      });

      var data = await res.json();
      hideTyping();

      var reply = data.reply || data.error || 'Something went wrong. Please try again.';
      addMessage('assistant', reply);

      if (data.reply) {
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: data.reply });
        if (history.length > 20) history = history.slice(-20);
      }
    } catch (err) {
      hideTyping();
      addMessage('assistant', 'Something went wrong. You can also email info@realmissai.com.');
    }

    setLoading(false);
    input.focus();
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}());
});
