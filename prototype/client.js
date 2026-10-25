(() => {
  const consultation = window.accescompanionSession;
  const connectionHub = document.querySelector('.connection-hub');

  if (!consultation || !connectionHub) {
    return;
  }

  const POLL_INTERVAL_MS = 600;
  const panel = createTestPanel();
  connectionHub.before(panel);

  const pairingButton = panel.querySelector('#pairMcpTest');
  const stopButton = panel.querySelector('#stopMcpTest');
  const statusElement = panel.querySelector('#mcpTestStatus');
  const pendingElement = panel.querySelector('#mcpPending');
  const historyElement = panel.querySelector('#mcpHistory');
  const openaiForm = panel.querySelector('#openaiForm');
  const askOpenAI = panel.querySelector('#askOpenAI');
  const openaiStatus = panel.querySelector('#openaiStatus');
  const seenCommands = new Set();

  let session = null;
  let pollTimer = null;
  let polling = false;
  let lastSnapshot = '';
  let agentReady = false;

  fetch('/bridge/agent-config')
    .then((response) => {
      if (!response.ok) throw new Error('Configuration indisponible.');
      return response.json();
    })
    .then((config) => {
      agentReady = config.ready === true;
      askOpenAI.disabled = !agentReady;
      panel.querySelector('#openaiConfig').textContent = agentReady
        ? 'OpenAI configuré · ' + config.model
        : 'Ajoutez OPENAI_API_KEY dans le fichier .env du projet, puis redémarrez le serveur.';
    })
    .catch(() => {
      panel.querySelector('#openaiConfig').textContent =
        'Configuration OpenAI indisponible. Rechargez la page.';
    });

  function createTestPanel() {
    const element = document.createElement('section');
    element.className = 'connection-hub';
    element.id = 'mcpTestPanel';
    element.innerHTML = `
      <div class="eyebrow">TEST MCP LOCAL · EXEMPLE FICTIF</div>
      <h2>Un agent, relié à cette conversation.</h2>
      <p>
        Ce prototype partage uniquement les messages marqués fictifs avec le pont
        local en mémoire. Il ne rejoint aucun appel et n’active pas le micro.
        La lecture d’une réponse nécessite votre accord ici.
      </p>
      <button class="primary" id="pairMcpTest">
        Partager l’exemple et lier un agent
      </button>
      <p id="mcpTestStatus" role="status"></p>
      <form id="openaiForm" hidden>
        <h3>Préparer ma réponse avec OpenAI</h3>
        <p id="openaiConfig" role="status"></p>
        <label for="agentIntent">Ce que je souhaite dire dans cet exemple fictif</label>
        <textarea id="agentIntent" maxlength="1000" required
          placeholder="Je voudrais demander au soignant de répéter plus lentement."></textarea>
        <label class="check-label">
          <input id="openaiConsent" type="checkbox" required>
          <span>J’accepte d’envoyer à OpenAI l’échange fictif partagé et ma demande.
            Ces requêtes utilisent les crédits API du compte configuré.</span>
        </label>
        <button class="primary" id="askOpenAI" disabled>Proposer une réponse à approuver</button>
        <p id="openaiStatus" role="status"></p>
      </form>
      <div id="mcpPending"></div>
      <div id="mcpHistory" aria-live="polite"></div>
      <button class="secondary" id="stopMcpTest" hidden>
        Déconnecter et effacer le test MCP
      </button>
    `;
    return element;
  }

  function setStatus(message) {
    statusElement.textContent = message;
  }

  function addHistory(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    historyElement.append(paragraph);
  }

  async function bridgeRequest(action, payload = {}, credentials = session) {
    const response = await fetch(`/bridge/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(credentials ? { Authorization: `Bearer ${credentials.browser_token}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        ...(credentials ? { session_id: credentials.session_id } : {}),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Pont indisponible.');
    }

    return result;
  }

  function resetConnection() {
    clearInterval(pollTimer);
    pollTimer = null;
    session = null;
    lastSnapshot = '';
    seenCommands.clear();
    pendingElement.replaceChildren();
    openaiForm.hidden = true;
    openaiForm.reset();
    openaiStatus.textContent = '';
    askOpenAI.disabled = !agentReady;
    delete panel.dataset.pairingCode;
    pairingButton.disabled = false;
    stopButton.hidden = true;
  }

  function removeExpiredProposals(commands) {
    for (const element of pendingElement.querySelectorAll('[data-command-id]')) {
      if (!commands.some((command) => command.id === element.dataset.commandId)) {
        element.remove();
      }
    }
  }

  async function applyPreparation(command) {
    consultation.prepareReadingMode(command.mode);
    await bridgeRequest('ack', { id: command.id, status: 'applied' });
    addHistory('L’agent a préparé le mode de lecture. Aucun microphone activé.');
  }

  async function applyDraft(command) {
    const applied = consultation.applyDraft(command.text);
    await bridgeRequest('ack', {
      id: command.id,
      status: applied ? 'applied' : 'failed',
    });
    addHistory(
      applied
        ? 'Brouillon fictif reçu via MCP. Relecture requise, aucune lecture automatique.'
        : 'Brouillon non appliqué : vos notes existantes ont été conservées.',
    );
  }

  function createSpeechProposal(command) {
    const proposal = document.createElement('div');
    proposal.className = 'callbox';
    proposal.dataset.commandId = command.id;

    const title = document.createElement('strong');
    title.textContent = 'L’agent propose cette réponse fictive :';
    const message = document.createElement('p');
    message.textContent = command.text;
    const approveButton = document.createElement('button');
    approveButton.className = 'primary';
    approveButton.textContent = 'Approuver et lire cette réponse';
    const rejectButton = document.createElement('button');
    rejectButton.className = 'secondary';
    rejectButton.textContent = 'Refuser';
    proposal.append(title, message, approveButton, rejectButton);

    function disableButtons() {
      approveButton.disabled = true;
      rejectButton.disabled = true;
    }

    approveButton.addEventListener('click', async () => {
      disableButtons();
      const approvingSession = session;

      try {
        if (!approvingSession) {
          throw new Error('Session arrêtée.');
        }

        const state = await bridgeRequest('poll');
        if (session !== approvingSession || !state.active) {
          throw new Error('Session arrêtée.');
        }
        if (!state.commands.some((pending) => pending.id === command.id)) {
          throw new Error('Action expirée.');
        }

        const acknowledgment = await bridgeRequest('ack', {
          id: command.id,
          status: 'approved',
        });
        if (session !== approvingSession) {
          throw new Error('Session arrêtée.');
        }
        if (acknowledgment.status !== 'approved') {
          throw new Error('Action expirée. Relisez la conversation avant de proposer une réponse.');
        }

        const played = await consultation.speakApprovedReply(command.text);
        if (played) {
          addHistory('Réponse approuvée et lecture demandée au navigateur.');
        } else {
          await bridgeRequest('ack', { id: command.id, status: 'failed' });
          addHistory('Lecture indisponible sur cet appareil.');
        }
      } catch (error) {
        setStatus(error.message);
      } finally {
        proposal.remove();
      }
    });

    rejectButton.addEventListener('click', async () => {
      disableButtons();
      try {
        await bridgeRequest('ack', { id: command.id, status: 'rejected' });
        addHistory('Réponse refusée. Aucun son joué.');
      } catch (error) {
        setStatus(error.message);
      } finally {
        proposal.remove();
      }
    });

    pendingElement.append(proposal);
  }

  async function applyCommand(command) {
    switch (command.type) {
      case 'prepare':
        await applyPreparation(command);
        break;
      case 'draft':
        await applyDraft(command);
        break;
      case 'speak':
        createSpeechProposal(command);
        break;
      default:
        throw new Error('Commande MCP inconnue.');
    }
  }

  async function pollSession() {
    if (!session || polling) {
      return;
    }

    polling = true;
    const pollingSession = session;

    try {
      const state = await bridgeRequest('poll');
      if (session !== pollingSession) {
        return;
      }
      if (!state.active) {
        resetConnection();
        consultation.clear();
        setStatus('Test arrêté. Messages, notes et liaison effacés.');
        return;
      }
      if (state.paired) {
        setStatus('Agent lié · seuls les messages fictifs sont partagés.');
      }

      removeExpiredProposals(state.commands);
      const messages = consultation.getFictionalMessages();
      const snapshot = JSON.stringify(messages);
      if (snapshot !== lastSnapshot) {
        await bridgeRequest('snapshot', { messages });
        if (session !== pollingSession) {
          return;
        }
        lastSnapshot = snapshot;
      }

      for (const command of state.commands) {
        if (session !== pollingSession) {
          return;
        }
        if (!seenCommands.has(command.id)) {
          await applyCommand(command);
          seenCommands.add(command.id);
        }
      }
    } catch (error) {
      setStatus(error.message);
      clearInterval(pollTimer);
      pollTimer = null;
    } finally {
      polling = false;
    }
  }

  async function startTest() {
    try {
      if (consultation.hasRealMessages()) {
        throw new Error('Effacez votre conversation réelle avant de lancer ce test fictif.');
      }
      if (!consultation.getFictionalMessages().length) {
        consultation.loadExample();
      }

      session = await bridgeRequest('pair', { fictional_test: true });
      pairingButton.disabled = true;
      stopButton.hidden = false;
      openaiForm.hidden = false;
      panel.dataset.pairingCode = session.pairing_code;
      setStatus(`Code de liaison à usage unique : ${session.pairing_code} · valable 5 minutes.`);
      await pollSession();
      if (session) {
        pollTimer = setInterval(pollSession, POLL_INTERVAL_MS);
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  function closeSharedSession() {
    const closingSession = session;
    resetConnection();

    if (closingSession) {
      fetch('/bridge/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${closingSession.browser_token}`,
        },
        body: JSON.stringify({ session_id: closingSession.session_id }),
        keepalive: true,
      }).catch(() => {});
      setStatus('Test déconnecté et conversation effacée.');
    }
  }

  openaiForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const linkedSession = session;
    if (!linkedSession || !agentReady) return;
    askOpenAI.disabled = true;
    openaiStatus.textContent = 'OpenAI prépare une proposition…';
    try {
      if (consultation.hasRealMessages())
        throw new Error('Seul l’exemple fictif peut être partagé avec cet agent.');
      await bridgeRequest('snapshot', { messages: consultation.getFictionalMessages() });
      if (session !== linkedSession) return;
      await bridgeRequest('agent', {
        intent: panel.querySelector('#agentIntent').value,
        openai_consent: panel.querySelector('#openaiConsent').checked,
      });
      if (session !== linkedSession) return;
      openaiStatus.textContent =
        'Proposition prête. Vous pouvez l’approuver ou la refuser ci-dessous.';
      await pollSession();
    } catch (error) {
      if (session === linkedSession) openaiStatus.textContent = error.message;
    } finally {
      if (session === linkedSession) askOpenAI.disabled = !agentReady;
    }
  });

  pairingButton.addEventListener('click', startTest);
  stopButton.addEventListener('click', () => {
    consultation.clear();
  });
  window.addEventListener('accescompanion:session-cleared', closeSharedSession);
})();
