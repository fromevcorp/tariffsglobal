/**
 * Calls the Gemini API (gemini-2.5-flash-preview-09-2025) with exponential backoff for reliability.
 *
 * @param {string} systemPrompt - Defines the model's persona and rules.
 * @param {string} userQuery - The specific request for the model.
 * @param {boolean} [useGrounding=false] - Whether to use Google Search for grounding (real-time data).
 * @param {number} [maxRetries=5] - Maximum number of retries for 429 errors.
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>} An object containing the generated text and citation sources.
 */
async function callGemini(systemPrompt, userQuery, useGrounding = false, maxRetries = 5) {
    const modelName = 'gemini-2.5-flash-preview-09-2025';
    // The API key is intentionally left empty as it is provided by the execution environment.
    const apiKey = "AIzaSyC-kYUs6Vn6bRe0dmbrNJqY8l_wrf07BoY"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // --- 1. Construct the API Payload ---
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            // Low temperature for factual, analytical results (like trade reports)
            temperature: 0.1, 
        }
    };

    // Add Google Search tool if grounding is requested
    if (useGrounding) {
        payload.tools = [{ "google_search": {} }];
    }

    // --- 2. Exponential Backoff and Retry Loop ---
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const candidate = result.candidates?.[0];

                if (candidate && candidate.content?.parts?.[0]?.text) {
                    const text = candidate.content.parts[0].text;
                    let sources = [];
                    
                    // --- 3. Extract Grounding Sources ---
                    const groundingMetadata = candidate.groundingMetadata;
                    if (groundingMetadata && groundingMetadata.groundingAttributions) {
                        sources = groundingMetadata.groundingAttributions
                            .map(attribution => ({
                                uri: attribution.web?.uri,
                                title: attribution.web?.title,
                            }))
                            .filter(source => source.uri && source.title); // Ensure sources are valid
                    }
                    
                    // Return the successful result
                    return { text, sources };
                } else {
                    // Handle cases where response is OK but content is missing or blocked
                    throw new Error("Invalid response structure from API or content blocked.");
                }
            } else if (response.status === 429) {
                // Too many requests error (retryable)
                // Wait for the calculated delay and then continue the loop
            } else {
                // Non-retryable error (e.g., 400 Bad Request, 500 Server Error)
                const errorBody = await response.json();
                console.error(`Gemini API Error (Non-retryable): ${response.status}`, errorBody);
                throw new Error(`API returned status code ${response.status}: ${errorBody.error.message}`);
            }
        } catch (error) {
            // Log final failure after max retries
            if (i === maxRetries - 1) {
                console.error("Gemini API call failed after max retries:", error);
                return { text: "Error: The AI service failed to provide a response after multiple attempts.", sources: [] };
            }
        }
        
        // Wait using exponential backoff before the next attempt
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
    }
    
    // Should be caught by the final failure in the loop, but included for completeness
    return { text: "Error: The AI service failed to provide a response.", sources: [] };
}