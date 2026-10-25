export function reviewSource(practice, changes = {}) {
  return {
    url: 'https://avis.exemple.fr/cabinet',
    title: 'Avis publics de test',
    entityName: practice.name,
    entityAddress: practice.address,
    entityType: 'establishment',
    ambiguous: false,
    rating: 4.2,
    ratingScale: 5,
    reviewCount: 20,
    updatedAt: null,
    observations: [],
    ...changes,
  };
}
export function reviewResponse(sources, retrieved = sources.map((source) => source.url)) {
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', sources: retrieved.map((url) => ({ type: 'url', url })) },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({ sources }),
            annotations: retrieved.map((url) => ({
              type: 'url_citation',
              url,
              title: 'Source de test',
            })),
          },
        ],
      },
    ],
  });
}
