// --- Self-contained Helper Functions (copied from import-chatgpt-script.js) ---
const generateId = (prefix = 'node') => {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
};

const formatTimestamp = (unixTimestamp) => {
  if (unixTimestamp === null || typeof unixTimestamp === 'undefined') {
    return new Date().toISOString();
  }
  return new Date(unixTimestamp * 1000).toISOString();
};

const getMimeTypeFromDataUri = (dataUri) => {
  const match = dataUri?.match(/^data:(.+);base64,/);
  return match ? match[1] : 'application/octet-stream';
};

// --- Recursive Branch Processing (adapted from import-chatgpt-script.js) ---
const processBranchRecursively = (
  sourceNodeId,
  parentTargetId,
  sourceMapping,
  targetConversation,
  sourceIdToTargetIdMap,
  processedSourceNodeIds
) => {
  if (!sourceNodeId || processedSourceNodeIds.has(sourceNodeId) || !sourceMapping[sourceNodeId]) {
    return;
  }

  const sourceNode = sourceMapping[sourceNodeId];
  processedSourceNodeIds.add(sourceNodeId);

  if (!sourceNode.message) {
    (sourceNode.children || []).forEach(childId => {
      processBranchRecursively(childId, parentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
    });
    return;
  }

  const message = sourceNode.message;
  const role = message.author?.role;
  const contentType = message.content?.content_type;
  const isHidden = message.metadata?.is_visually_hidden_from_conversation;

  if (
    !role ||
    ['system', 'tool'].includes(role) ||
    ['user_context_message', 'system_context', 'thought', 'reasoning_recap', 'model_editable_context'].includes(contentType) ||
    isHidden ||
    !message.content
  ) {
    (sourceNode.children || []).forEach(childId => {
      processBranchRecursively(childId, parentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
    });
    return;
  }

  if (role === 'user' || role === 'assistant') {
    let targetContent;
    let hasContent = false;

    if (contentType === 'multimodal_text') {
      targetContent = [];
      (message.content.parts || []).forEach((part) => {
        if (typeof part === 'string' && part.trim()) {
          targetContent.push({ type: 'text', text: part });
          hasContent = true;
        } else if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
          targetContent.push({ type: 'text', text: '[Image content in branch - not fully imported]' });
          hasContent = true;
        }
      });
      if (!hasContent) return;
    } else if (contentType === 'text') {
      const text = (message.content.parts || []).join('\n').trim();
      if (!text) {
        (sourceNode.children || []).forEach(childId => {
          processBranchRecursively(childId, parentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
        });
        return;
      }
      targetContent = text;
      hasContent = true;
    } else {
      (sourceNode.children || []).forEach(childId => {
        processBranchRecursively(childId, parentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
      });
      return;
    }

    const newTargetMsgId = generateId('msg');
    sourceIdToTargetIdMap[sourceNodeId] = newTargetMsgId;

    const targetMessageNode = {
      id: newTargetMsgId,
      type: 'message',
      role: role,
      content: targetContent,
      createdAt: formatTimestamp(message.create_time),
      nextMessageId: null,
      childrenMessageIds: [],
      artifactsCreated: [],
    };

    targetConversation.message_nodes[newTargetMsgId] = targetMessageNode;
    // self.postMessage({ type: 'debug', message: `Branch: Added message ${newTargetMsgId}` });


    if (parentTargetId && targetConversation.message_nodes[parentTargetId]) {
      targetConversation.message_nodes[parentTargetId].childrenMessageIds.push(newTargetMsgId);
    } else {
      self.postMessage({ type: 'warning', message: `Branch: Could not find parent target node ${parentTargetId} to link child ${newTargetMsgId}` });
    }

    (sourceNode.children || []).forEach(childId => {
      processBranchRecursively(childId, newTargetMsgId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
    });
  } else {
    (sourceNode.children || []).forEach(childId => {
      processBranchRecursively(childId, parentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
    });
  }
};

// --- Single Conversation Processor (adapted from import-chatgpt-script.js) ---
const processSingleConversation = (sourceConversation, overallConversationsProcessed, totalConversations) => {
  if (!sourceConversation.mapping || !sourceConversation.current_node) {
    self.postMessage({
      type: 'warning',
      message: `Skipping conversation ${sourceConversation.title || overallConversationsProcessed + 1}: Missing 'mapping' or 'current_node'.`
    });
    // Send a progress update indicating this conversation is skipped
    self.postMessage({
      type: 'progress',
      overallConversationsProcessed: overallConversationsProcessed,
      totalConversations: totalConversations,
      currentConversationTitle: sourceConversation.title || `Conversation ${overallConversationsProcessed + 1}`,
      currentConversationStage: 'skipped_early',
    });
    return null;
  }

  const targetConvId = generateId('conv');
  const targetConversation = {
    id: targetConvId,
    title: sourceConversation.title || `Imported Conversation ${sourceIndex + 1}`,
    createdAt: formatTimestamp(sourceConversation.create_time),
    updatedAt: formatTimestamp(sourceConversation.update_time),
    firstMessageNodeId: null,
    message_nodes: {},
    artifact_nodes: {},
  };

  const sourceMapping = sourceConversation.mapping;
  const mainBranchSourceIds = [];
  let currentNodeId = sourceConversation.current_node;

  while (currentNodeId && sourceMapping[currentNodeId]) {
    const node = sourceMapping[currentNodeId];
    mainBranchSourceIds.push(currentNodeId);
    if (!node.parent || node.parent === 'client-created-root') { // Handle root node case
      break;
    }
    currentNodeId = node.parent;
  }
  mainBranchSourceIds.reverse();

  const totalNodesInThisConversation = mainBranchSourceIds.length;
  // Initial progress for this specific conversation
  self.postMessage({
    type: 'progress',
    overallConversationsProcessed: overallConversationsProcessed,
    totalConversations: totalConversations,
    currentConversationTitle: targetConversation.title,
    currentConversationStage: 'initializing',
    currentConversationNodesProcessed: 0,
    currentConversationTotalNodes: totalNodesInThisConversation,
  });

  const sourceIdToTargetIdMap = {};
  let lastTargetMessageId = null;
  const processedSourceNodeIds = new Set();

  for (let i = 0; i < mainBranchSourceIds.length; i++) {
    const sourceNodeId = mainBranchSourceIds[i];
    const nextMainBranchSourceId = (i + 1 < mainBranchSourceIds.length) ? mainBranchSourceIds[i + 1] : null;

    if (processedSourceNodeIds.has(sourceNodeId)) continue;

    const sourceNode = sourceMapping[sourceNodeId];
    if (!sourceNode) {
      processedSourceNodeIds.add(sourceNodeId);
      continue;
    }

    let currentTargetNodeId = null;
    let handledAsPattern = false;
    const message = sourceNode.message;
    const role = message?.author?.role;
    const contentType = message?.content?.content_type;
    let currentNodeProcessedTypeHint = contentType || 'system_node';

    // --- DALL-E Image Pattern Check (Lookahead) ---
    if (
      role === 'assistant' &&
      contentType === 'text' &&
      i + 1 < mainBranchSourceIds.length
    ) {
      const promptNode = sourceNode;
      const toolNodeId = mainBranchSourceIds[i + 1];
      const toolNode = sourceMapping[toolNodeId];

      if (
        toolNode?.message?.author?.role === 'tool' &&
        toolNode?.message?.content?.content_type === 'multimodal_text' &&
        toolNode?.message?.content?.parts?.[0]?.content_type === 'image_asset_pointer'
      ) {
        // self.postMessage({ type: 'debug', message: `Main Branch: Potential DALL-E pattern at ${sourceNodeId}` });
        currentNodeProcessedTypeHint = 'dalle_pattern_check';
        let finalAssistantNode = null;
        let finalAssistantNodeId = null;
        let currentSearchIndex = i + 1;
        let lastValidParentInSequence = toolNodeId;
        let nodesInPattern = [sourceNodeId, toolNodeId];

        while (currentSearchIndex + 1 < mainBranchSourceIds.length) {
          const nextNodeIndex = currentSearchIndex + 1;
          const nextNodeId = mainBranchSourceIds[nextNodeIndex];
          const nextNode = sourceMapping[nextNodeId];

          if (!nextNode || nextNode.parent !== lastValidParentInSequence) break;
          nodesInPattern.push(nextNodeId);

          if (nextNode.message?.author?.role === 'assistant') {
            finalAssistantNode = nextNode;
            finalAssistantNodeId = nextNodeId;
            break;
          } else if (nextNode.message?.author?.role === 'tool') {
            lastValidParentInSequence = nextNodeId;
            currentSearchIndex = nextNodeIndex;
          } else {
            break;
          }
        }

        if (finalAssistantNode) {
          currentNodeProcessedTypeHint = 'dalle_image_processed';
          const promptText = (promptNode.message.content.parts || []).join('\n').trim();
          const promptContentPart = promptText ? { type: 'text', text: promptText } : null;

          const imagePart = toolNode.message.content.parts[0];
          const imageContentPart = {
            type: 'image_url',
            imageUrl: imagePart.asset_pointer, // This is a URL/pointer in ChatGPT export, not base64
            width: imagePart.width,
            height: imagePart.height,
            mimeType: getMimeTypeFromDataUri(imagePart.asset_pointer), // May need adjustment if asset_pointer is not a data URI
            title: toolNode.message.metadata?.image_gen_title || `Generated Image`
          };

          const finalMessageContent = finalAssistantNode.message;
          const finalTextParts = (finalMessageContent.content?.parts || [])
            .filter(part => typeof part === 'string' && part.trim())
            .map(text => ({ type: 'text', text: text.trim() }));

          const targetContent = [
            ...(promptContentPart ? [promptContentPart] : []),
            ...finalTextParts,
            imageContentPart
          ].filter(Boolean);

          const newTargetMsgId = generateId('msg');
          sourceIdToTargetIdMap[finalAssistantNodeId] = newTargetMsgId;
          currentTargetNodeId = newTargetMsgId;

          targetConversation.message_nodes[newTargetMsgId] = {
            id: newTargetMsgId, type: 'message', role: 'assistant', content: targetContent,
            createdAt: formatTimestamp(finalAssistantNode.message.create_time),
            nextMessageId: null, childrenMessageIds: [], artifactsCreated: [],
          };

          if (lastTargetMessageId) {
            const prevNode = targetConversation.message_nodes[lastTargetMessageId];
            if (prevNode) prevNode.nextMessageId = newTargetMsgId;
          } else {
            targetConversation.firstMessageNodeId = newTargetMsgId;
          }
          lastTargetMessageId = newTargetMsgId;

          nodesInPattern.forEach(id => processedSourceNodeIds.add(id));

          let finalNodeOriginalIndex = -1;
          for (let j = 0; j < mainBranchSourceIds.length; j++) {
            if (mainBranchSourceIds[j] === finalAssistantNodeId) {
              finalNodeOriginalIndex = j;
              break;
            }
          }
          if (finalNodeOriginalIndex !== -1) i = finalNodeOriginalIndex;
          else i = currentSearchIndex + 1; // Fallback

          handledAsPattern = true;
        } else {
          self.postMessage({ type: 'warning', message: `Main Branch: Could not find final assistant node for DALL-E pattern at ${sourceNodeId}` });
        }
      }
    }

    // --- Canvas Pattern Check ---
    const recipient = message?.recipient;
    if (
      !handledAsPattern &&
      role === 'assistant' &&
      recipient === 'canmore.create_textdoc' &&
      i + 2 < mainBranchSourceIds.length
    ) {
      currentNodeProcessedTypeHint = 'canvas_pattern_check';
      const codeGenNode = sourceNode;
      const toolNodeId = mainBranchSourceIds[i + 1];
      const toolNode = sourceMapping[toolNodeId];
      const finalAssistantNodeId = mainBranchSourceIds[i + 2];
      const finalAssistantNode = sourceMapping[finalAssistantNodeId];

      if (
        toolNode?.message?.author?.role === 'tool' &&
        toolNode?.message?.author?.name === 'canmore.create_textdoc' &&
        finalAssistantNode?.message?.author?.role === 'assistant' &&
        toolNode.parent === sourceNodeId &&
        finalAssistantNode.parent === toolNodeId
      ) {
        let artifactJsonString = codeGenNode.message.content?.parts?.[0];
        if (artifactJsonString) {
          try {
            artifactJsonString = artifactJsonString.replace(/^```json\s*|\s*```$/g, '');
            const parsedArtifactData = JSON.parse(artifactJsonString);

            if (parsedArtifactData && parsedArtifactData.content) {
              currentNodeProcessedTypeHint = 'code_artifact_processed';
              const newTargetArtId = generateId('art');
              targetConversation.artifact_nodes[newTargetArtId] = {
                id: newTargetArtId, type: 'artifact', content: parsedArtifactData.content,
                metadata: {
                  type: (parsedArtifactData.type || 'text').startsWith('code/') ? 'code' : 'text',
                  language: (parsedArtifactData.type || '').startsWith('code/') ? (parsedArtifactData.type.split('/')[1] || null) : ((parsedArtifactData.type === 'python') ? 'python' : null),
                  title: parsedArtifactData.name || toolNode.message?.metadata?.canvas?.title || `Artifact ${newTargetArtId}`,
                },
                createdAt: formatTimestamp(codeGenNode.message.create_time),
              };

              const newTargetMsgId = generateId('msg');
              sourceIdToTargetIdMap[finalAssistantNodeId] = newTargetMsgId;
              const textContent = (finalAssistantNode.message.content.parts || []).join('\n') || '';
              targetConversation.message_nodes[newTargetMsgId] = {
                id: newTargetMsgId, type: 'message', role: 'assistant',
                content: textContent + `\n<artifactrenderer id="${newTargetArtId}"></artifactrenderer>`,
                createdAt: formatTimestamp(finalAssistantNode.message.create_time),
                nextMessageId: null, childrenMessageIds: [], artifactsCreated: [newTargetArtId],
              };
              currentTargetNodeId = newTargetMsgId;

              if (lastTargetMessageId) targetConversation.message_nodes[lastTargetMessageId].nextMessageId = newTargetMsgId;
              else targetConversation.firstMessageNodeId = newTargetMsgId;
              lastTargetMessageId = newTargetMsgId;

              processedSourceNodeIds.add(sourceNodeId);
              processedSourceNodeIds.add(toolNodeId);
              processedSourceNodeIds.add(finalAssistantNodeId);
              i += 2;
              handledAsPattern = true;
            }
          } catch (parseError) {
            self.postMessage({ type: 'warning', message: `Failed to parse artifact JSON in node ${sourceNodeId}: ${parseError.message}` });
          }
        }
      }
    }

    // --- Handle Regular Nodes ---
    if (!handledAsPattern && message) {
      const isHidden = message.metadata?.is_visually_hidden_from_conversation;
      if (
        !role || ['system', 'tool'].includes(role) ||
        ['user_context_message', 'system_context', 'thought', 'reasoning_recap', 'model_editable_context'].includes(contentType) ||
        isHidden || !message.content
      ) {
        processedSourceNodeIds.add(sourceNodeId);
      } else if (role === 'user' || role === 'assistant') {
        let targetContentValue;
        let hasContent = false;

        if (contentType === 'multimodal_text') {
          const tempContent = [];
          const attachments = message.metadata?.attachments || [];
          (message.content.parts || []).forEach((part, partIndex) => {
            if (typeof part === 'string' && part.trim()) {
              tempContent.push({ type: 'text', text: part.trim() });
              hasContent = true;
            } else if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
              currentNodeProcessedTypeHint = 'user_image';
              const attachment = attachments[partIndex] || {};
              tempContent.push({
                type: 'image_url', imageUrl: part.asset_pointer, width: part.width, height: part.height,
                mimeType: attachment.mime_type || getMimeTypeFromDataUri(part.asset_pointer),
                title: attachment.name || `Uploaded Image ${partIndex + 1}`
              });
              hasContent = true;
            }
          });
          if (hasContent) targetContentValue = tempContent;
        } else if (contentType === 'text') {
          currentNodeProcessedTypeHint = 'text_message';
          const text = (message.content.parts || []).join('\n').trim();
          if (text) {
            targetContentValue = text; // Simple string for text
            hasContent = true;
          }
        }

        if (hasContent && targetContentValue !== undefined) {
          const newTargetMsgId = generateId('msg');
          sourceIdToTargetIdMap[sourceNodeId] = newTargetMsgId;
          currentTargetNodeId = newTargetMsgId;
          targetConversation.message_nodes[newTargetMsgId] = {
            id: newTargetMsgId, type: 'message', role: role, content: targetContentValue,
            createdAt: formatTimestamp(message.create_time),
            nextMessageId: null, childrenMessageIds: [], artifactsCreated: [],
          };
          if (lastTargetMessageId) targetConversation.message_nodes[lastTargetMessageId].nextMessageId = newTargetMsgId;
          else targetConversation.firstMessageNodeId = newTargetMsgId;
          lastTargetMessageId = newTargetMsgId;
          processedSourceNodeIds.add(sourceNodeId);
        } else {
          processedSourceNodeIds.add(sourceNodeId);
        }
      } else {
        processedSourceNodeIds.add(sourceNodeId);
      }
    } else if (!handledAsPattern) { // Node without message
      processedSourceNodeIds.add(sourceNodeId);
      currentTargetNodeId = sourceIdToTargetIdMap[sourceNodeId] || null;
    }

    // --- Process Children ---
    const targetParentId = currentTargetNodeId || sourceIdToTargetIdMap[sourceNode.parent];
    if (targetParentId && targetConversation.message_nodes[targetParentId]) {
      (sourceNode.children || []).forEach(childSourceId => {
        if (childSourceId !== nextMainBranchSourceId && !processedSourceNodeIds.has(childSourceId)) {
          // Indicate branching before diving in
          self.postMessage({
            type: 'progress',
            overallConversationsProcessed: overallConversationsProcessed,
            totalConversations: totalConversations,
            currentConversationTitle: targetConversation.title,
            currentConversationStage: 'processing_side_branches',
            currentConversationNodesProcessed: i + 1, // Current main branch node count
            currentConversationTotalNodes: totalNodesInThisConversation,
            currentNodeBeingProcessedType: 'branch_start'
          });
          processBranchRecursively(childSourceId, targetParentId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
        }
      });
    } else if (sourceNode.children?.length > 0 && !processedSourceNodeIds.has(sourceNodeId)) {
      const grandParentTargetId = sourceIdToTargetIdMap[sourceNode.parent];
      if (grandParentTargetId && targetConversation.message_nodes[grandParentTargetId]) {
        (sourceNode.children || []).forEach(childSourceId => {
          if (childSourceId !== nextMainBranchSourceId && !processedSourceNodeIds.has(childSourceId)) {
            // Indicate branching
            self.postMessage({
              type: 'progress',
              overallConversationsProcessed: overallConversationsProcessed,
              totalConversations: totalConversations,
              currentConversationTitle: targetConversation.title,
              currentConversationStage: 'processing_side_branches_from_grandparent',
              currentConversationNodesProcessed: i + 1,
              currentConversationTotalNodes: totalNodesInThisConversation,
              currentNodeBeingProcessedType: 'branch_start'
            });
            processBranchRecursively(childSourceId, grandParentTargetId, sourceMapping, targetConversation, sourceIdToTargetIdMap, processedSourceNodeIds);
          }
        });
      } else {
        self.postMessage({ type: 'warning', message: `Could not find target parent for ${sourceNodeId} to process children.` });
      }
    }
    // Update progress after processing the current main branch node
    self.postMessage({
      type: 'progress',
      overallConversationsProcessed: overallConversationsProcessed,
      totalConversations: totalConversations,
      currentConversationTitle: targetConversation.title,
      currentConversationStage: 'processing_main_branch',
      currentConversationNodesProcessed: i + 1,
      currentConversationTotalNodes: totalNodesInThisConversation,
      currentNodeBeingProcessedType: currentNodeProcessedTypeHint
    });
  } // End main branch loop

  Object.values(targetConversation.message_nodes).forEach(node => {
    if (node.nextMessageId && targetConversation.message_nodes[node.nextMessageId] && !node.childrenMessageIds.includes(node.nextMessageId)) {
      // Ensure the main path is also considered a "child" for branching display if your UI expects it
      // Or, your UI might handle nextMessageId separately from childrenMessageIds for rendering.
      // The original script added it, so keeping consistency.
      node.childrenMessageIds.push(node.nextMessageId);
    }
  });

  if (targetConversation.firstMessageNodeId) {
    // Final progress update for this conversation: completed
    self.postMessage({
      type: 'progress',
      overallConversationsProcessed: overallConversationsProcessed,
      totalConversations: totalConversations,
      currentConversationTitle: targetConversation.title,
      currentConversationStage: 'completed',
      currentConversationNodesProcessed: totalNodesInThisConversation, // Mark all as processed
      currentConversationTotalNodes: totalNodesInThisConversation,
    });
    return targetConversation;
  } else {
    self.postMessage({ type: 'warning', message: `Skipping conversation "${targetConversation.title}": No relevant messages found after processing.` });
    // Final progress update for this conversation: skipped
    self.postMessage({
      type: 'progress',
      overallConversationsProcessed: overallConversationsProcessed,
      totalConversations: totalConversations,
      currentConversationTitle: targetConversation.title,
      currentConversationStage: 'skipped_no_messages',
      currentConversationNodesProcessed: totalNodesInThisConversation,
      currentConversationTotalNodes: totalNodesInThisConversation,
    });
    return null;
  }
};

// --- Worker Event Listener ---
self.onmessage = (event) => {
  const { fileContent } = event.data;
  let sourceData;

  try {
    sourceData = JSON.parse(fileContent);
  } catch (e) {
    self.postMessage({ type: 'error', message: `Failed to parse JSON: ${e.message}` });
    return;
  }

  if (!Array.isArray(sourceData)) {
    self.postMessage({ type: 'error', message: 'Input data is not an array of conversations.' });
    return;
  }

  const outputConversations = {};
  const totalConversations = sourceData.length;

  if (totalConversations === 0) {
    self.postMessage({ type: 'complete', data: { conversations: {} } });
    return;
  }

  sourceData.forEach((sourceConversation, index) => {
    // Initial message for starting this conversation processing
    self.postMessage({
      type: 'progress',
      overallConversationsProcessed: index, // Current conversation index (0-based)
      totalConversations: totalConversations,
      currentConversationTitle: sourceConversation.title || `Conversation ${index + 1}`,
      currentConversationStage: 'starting_conversation', // Indicates a new conversation is beginning
      // Node-specific details will come from processSingleConversation
    });

    try {
      const convertedConv = processSingleConversation(sourceConversation, index, totalConversations);
      if (convertedConv) {
        outputConversations[convertedConv.id] = convertedConv;
      }
    } catch (convError) {
      // Log error for specific conversation, but continue with others
      self.postMessage({
        type: 'warning',
        message: `Error processing conversation "${sourceConversation.title || index + 1}": ${convError.message}. Stack: ${convError.stack}`
      });
    }
  });

  // Final overall progress message
  self.postMessage({
    type: 'progress',
    overallConversationsProcessed: totalConversations, // All conversations attempted
    totalConversations: totalConversations,
    currentConversationTitle: "Conversion complete.", // General status
    currentConversationStage: 'all_processing_finished', // A new stage for overall completion
  });
  self.postMessage({ type: 'complete', data: { conversations: outputConversations } });
};