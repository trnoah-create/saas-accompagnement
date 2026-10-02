// Remplace le paquet "server-only" pendant les tests : hors de Next, son
// import échoue alors que le code testé est bien du code serveur.
export {};
