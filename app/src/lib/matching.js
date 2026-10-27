// English matching items (Parte 2): each description picks one letter from a word list that every question of the
// group shares. The list is the options of the group's questions, so it is drawn once and each question only
// shows its letters.
export const isMatching = (question) => question?.item_type === "matching" && (question.options?.length ?? 0) > 0;
