// Requis par React 19 + react-test-renderer pour que les mises à jour d'état
// asynchrones (promesses résolues après le premier rendu) soient reconnues
// comme faisant partie de l'environnement de test act().
global.IS_REACT_ACT_ENVIRONMENT = true;
