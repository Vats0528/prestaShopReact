# 🔄 PrestaShop 8.2.6 - Scénarios de Workflows Détaillés

## 📌 Introduction

Les workflows représentent les **flux de données et processus** dans PrestaShop. Voici les scénarios les plus courants avec les tables et API impliquées.

---

## 📱 SCÉNARIO 1 : Achat Simple (Client New Visitor)

### Étapes & Flux de Données

```
ÉTAPE 1️⃣ : CLIENT ARRIVE SUR LE SITE
├─ Crée une session visiteur
├─ Table: ps_connections (enregistre visite)
├─ Table: ps_guest (crée si panier sans compte)
└─ API: GET /api/products (affiche produits)

ÉTAPE 2️⃣ : RECHERCHE PRODUIT
├─ Client clique sur catégorie
├─ Table: ps_category (récupère catégorie)
├─ Table: ps_product (filtre produits actifs)
├─ Table: ps_image (affiche photos)
└─ API: GET /api/categories/{id}/products

ÉTAPE 3️⃣ : CONSULTATION FICHE PRODUIT
├─ Voir détails: nom, description, prix
├─ Table: ps_product (données principales)
├─ Table: ps_product_attribute (si variantes)
├─ Table: ps_image (toutes les photos)
├─ Table: ps_feature (caractéristiques)
├─ Table: ps_feature_value (valeurs caract.)
├─ Table: ps_stock_available (quantité dispo)
└─ API: GET /api/products/{id}?schema=synopsis

ÉTAPE 4️⃣ : AJOUT AU PANIER
├─ Client clique "Ajouter au panier"
├─ Choix: Taille M, Couleur Bleu, Quantité 1
├─ Table: ps_cart (création/modification)
├─ Table: ps_cart_detail (ajout produit)
├─ Calcul: Vérifie ps_stock_available > 0
└─ API: POST /api/carts (ou PUT pour MAJ)

RÉSUMÉ PANIER:
├─ Produit: T-shirt bleu M
├─ Quantité: 1
├─ Prix unitaire: 29,99€ (de ps_product)
├─ Total: 29,99€
└─ Status: En attente de validation

ÉTAPE 5️⃣ : VALIDATION PANIER
├─ Client clique "Valider le panier"
├─ Vérifie: Stock, prix, quantité
├─ Table: ps_cart (id_cart chargé)
├─ Table: ps_cart_detail (tous les articles)
└─ API: GET /api/carts/{id} (voir contenu)

ÉTAPE 6️⃣ : PROCESSUS DE COMMANDE (Checkout)

📋 ÉTAPE CONNEXION:
├─ Client NEW → Crée compte
│  ├─ Table: ps_customer (INSERT)
│  ├─ Champs: firstname, lastname, email, passwd
│  ├─ API: POST /api/customers
│  └─ Génère: id_customer
│
├─ Client EXISTING → Login
│  ├─ Table: ps_customer (SELECT par email)
│  ├─ Vérifie password
│  └─ Génère: session avec id_customer

📦 ÉTAPE ADRESSES:
├─ Adresse de livraison
│  ├─ Sélectionne ou crée NEW
│  ├─ Table: ps_address (INSERT/SELECT)
│  ├─ Champs: firstname, lastname, address1, city, postcode, id_country, id_state
│  ├─ API: POST /api/addresses
│  └─ Génère: id_address_delivery
│
├─ Adresse facturation
│  ├─ Identique ou différente
│  ├─ Table: ps_address (INSERT)
│  └─ Génère: id_address_invoice

🚚 ÉTAPE LIVRAISON:
├─ Récupère les transporteurs possibles
├─ Table: ps_carrier (actifs et non supprimés)
├─ Table: ps_delivery (règles livraison)
├─ Table: ps_range_price / ps_range_weight
├─ Calcul frais: Selon poids/prix et zone
├─ Zone: Basée sur id_country (ps_zone)
├─ Client choisit: "Standard 3j = 7,99€"
├─ Enregistre: id_carrier choisi
└─ API: GET /api/carriers (voir tous)

💳 ÉTAPE PAIEMENT:
├─ Options disponibles (de modules)
│  ├─ Carte bancaire (Stripe, Paybox)
│  ├─ PayPal
│  ├─ Virement
│  └─ Paiement à la livraison
├─ Client choisit: "Carte bancaire"
└─ Panier prêt à paiement

RÉSUMÉ AVANT PAIEMENT:
├─ 🛍️  T-shirt bleu M x1      29,99€
├─ 🚚 Frais livraison        +7,99€
├─ 📊 Sous-total            37,98€
├─ 🏦 Taxes (20%)            +7,60€
├─ ────────────────────────
└─ 💰 TOTAL TTC             45,58€

ÉTAPE 7️⃣ : CRÉATION COMMANDE (Backend)
├─ Client valide paiement
├─ AVANT PAIEMENT REÇU:
│  └─ Table: ps_orders (INSERT)
│     ├─ id_customer = {id du client}
│     ├─ id_cart = {id du panier}
│     ├─ id_address_delivery
│     ├─ id_address_invoice
│     ├─ id_carrier
│     ├─ total_paid = 45,58€
│     ├─ valid = 0 (pas encore validée)
│     ├─ current_state = 1 (Attente paiement)
│     └─ date_add = NOW()
│
├─ Table: ps_order_detail (INSERT pour chaque produit)
│  ├─ id_order = {id_commande créée}
│  ├─ id_product = {id du produit}
│  ├─ id_product_attribute = {id combinaison si existe}
│  ├─ product_name = "T-shirt bleu"
│  ├─ product_quantity = 1
│  ├─ product_price = 29,99€
│  └─ product_quantity_in_stock = (avant réduction)
│
├─ Si code promo utilisé:
│  ├─ Table: ps_order_cart_rule (INSERT)
│  ├─ Enregistre: code appliqué, remise appliquée
│  └─ API: GET /api/order_cart_rules/{id_order}
│
└─ API: POST /api/orders (crée commande)

ÉTAPE 8️⃣ : PAIEMENT REÇU ✅
├─ Passerelle retourne: Paiement accepté
├─ PrestaShop reçoit notification
│
├─ Table: ps_order_payment (INSERT)
│  ├─ id_order = {id_commande}
│  ├─ amount = 45,58€
│  ├─ payment_method = "Carte bancaire"
│  ├─ transaction_id = "stripe_12345"
│  └─ date_add = NOW()
│
├─ Table: ps_orders (UPDATE)
│  ├─ valid = 1 (commande validée)
│  ├─ current_state = 2 (Paiement accepté)
│  └─ date_upd = NOW()
│
├─ Table: ps_order_history (INSERT)
│  ├─ id_order = {id_commande}
│  ├─ id_order_state = 2
│  ├─ id_employee = 0 (système)
│  └─ date_add = NOW()
│
└─ API: PUT /api/orders/{id} (MAJ status)

ÉTAPE 9️⃣ : REDUCTION STOCK 📉
├─ Stock diminué pour chaque produit
├─ Table: ps_stock_available (UPDATE)
│  ├─ WHERE id_product = {id}
│  ├─ WHERE id_product_attribute = {id}
│  ├─ quantity = quantity - 1
│  └─ En attente de ps_orders.valid = 1
│
├─ Table: ps_stock (UPDATE)
│  ├─ Si multi-entrepôt
│  ├─ id_warehouse = {entrepôt de livraison}
│  ├─ quantity = quantity - 1
│  └─ physical_quantity = quantity - 1
│
├─ Table: ps_stock_mvt (INSERT - Historique)
│  ├─ id_product = {id}
│  ├─ id_warehouse = {id}
│  ├─ quantity = -1
│  ├─ id_stock_mvt_reason = 3 (Commande client)
│  ├─ id_employee = 0
│  └─ date_add = NOW()
│
└─ API: PUT /api/stock_availables/{id}

ÉTAPE 🔟 : NOTIFICATIONS & EMAILS 📧
├─ Email client de confirmation
│  ├─ Template: ps_mail (id_mail = confirmation)
│  ├─ À: customer.email
│  ├─ Objet: "Confirmation de commande #12345"
│  ├─ Contenu: Détails commande, numéro de suivi
│  └─ Stocké: ps_log (si erreur)
│
├─ Email admin notification
│  ├─ À: admin.email (de ps_contact)
│  ├─ Objet: "Nouvelle commande #12345"
│  └─ Contenu: Détails pour préparation
│
├─ Table: ps_customer_thread (peut être créée)
│  ├─ Pour si client répond
│  └─ Track: support client
│
└─ Hook: hookActionOrderPaymentDone
   └─ Modules peuvent s'ajouter (paiement externe, promo)

ÉTAPE 1️⃣1️⃣ : NETTOYAGE PANIER
├─ Table: ps_cart (status = inactive après commande)
├─ Table: ps_cart_detail (DELETE)
└─ Client peut de nouveau commencer un nouveau panier
```

---

## 🔄 SCÉNARIO 2 : Gestion de Commande (Admin)

### De la Commande à la Livraison

```
ADMIN REÇOIT NOTIFICATION
└─ Admin panel → Menu Commandes → Voir #12345

ÉTAPE 1️⃣ : CONSULTATION COMMANDE
├─ Récupère depuis: ps_orders WHERE id_order = 12345
├─ Affiche:
│  ├─ Client: John Doe
│  ├─ Email: john@example.com
│  ├─ Status: Paiement accepté
│  ├─ Total: 45,58€
│  └─ Date: 05/05/2026 14:30
├─ Détails articles:
│  ├─ FROM ps_order_detail WHERE id_order = 12345
│  └─ T-shirt bleu M x1 à 29,99€
└─ API: GET /api/orders/12345

ÉTAPE 2️⃣ : ADMIN PRÉPARE LA COMMANDE
├─ Vérifie stock: ps_stock_available (T-shirt: 1 ok)
├─ Vérifie adresse livraison: ps_address
├─ Prépare le colis
└─ Marque comme "En préparation"

ÉTAPE 3️⃣ : CHANGEMENT D'ÉTAT → PRÉPARATION
├─ Admin clique "Changer l'état" → "Préparation"
├─ Table: ps_orders (UPDATE)
│  ├─ current_state = 4 (Préparation)
│  └─ date_upd = NOW()
│
├─ Table: ps_order_history (INSERT)
│  ├─ id_order = 12345
│  ├─ id_order_state = 4
│  ├─ id_employee = {id admin}
│  ├─ message = "Produit en préparation"
│  └─ date_add = NOW()
│
├─ Email client envoyé:
│  └─ "Votre commande est en cours de préparation"
│
└─ API: PUT /api/orders/12345
   └─ SET current_state = 4

ÉTAPE 4️⃣ : ÉTIQUETAGE & EXPÉDITION
├─ Admin imprime:
│  ├─ Étiquette transporteur (DHL, Colissimo)
│  ├─ Numéro suivi: TRACK123456789
│  └─ Facture d'expédition
│
├─ Emballage du colis
├─ Dépôt chez transporteur
└─ Scanne le numéro de suivi

ÉTAPE 5️⃣ : ENREGISTREMENT DANS PRESTASHOP
├─ Admin entre numéro suivi
├─ Table: ps_order_carrier (UPDATE)
│  ├─ WHERE id_order = 12345
│  ├─ tracking_number = "TRACK123456789"
│  ├─ shipping_cost_tax_excl = 7.99
│  └─ date_add = NOW()
│
├─ Changement d'état → "Expédié"
├─ Table: ps_orders (UPDATE)
│  ├─ current_state = 5 (Expédié)
│  └─ date_upd = NOW()
│
├─ Table: ps_order_history (INSERT)
│  ├─ id_order = 12345
│  ├─ id_order_state = 5
│  ├─ message = "Colis expédié - Suivre: TRACK123456789"
│  └─ date_add = NOW()
│
├─ Email client:
│  ├─ À: john@example.com
│  ├─ Objet: "Votre colis a été expédié!"
│  ├─ Contenu: Numéro suivi + lien tracking
│  └─ Email auto généré par hook
│
└─ API: PUT /api/order_carriers/12345

ÉTAPE 6️⃣ : FACTURATION
├─ Admin génère facture
├─ Table: ps_order_invoice (INSERT)
│  ├─ id_order = 12345
│  ├─ number = "2026050501" (auto)
│  ├─ total_discount_tax_excl = 0
│  ├─ total_paid_tax_excl = 37.98€
│  ├─ total_paid_tax_incl = 45.58€
│  └─ date_add = NOW()
│
├─ Table: ps_order_detail (UPDATE si nécessaire)
│  └─ Lie à la facture
│
├─ PDF généré: Facture2026050501.pdf
├─ Stocké dans: /pdf/invoice/
└─ Email client avec facture attachée

ÉTAPE 7️⃣ : CLIENT REÇOIT COLIS
├─ Colis en transit (Transporteur)
├─ Client voit tracking: TRACK123456789
├─ Colis livré ✅
└─ Table: ps_orders (pas changement auto)

ÉTAPE 8️⃣ : MARQUAGE COMME LIVRÉ
├─ Admin reçoit notification de transporteur (ou manuel)
├─ Admin change état → "Livré"
├─ Table: ps_orders (UPDATE)
│  ├─ current_state = 9 (Livré)
│  └─ date_upd = NOW()
│
├─ Table: ps_order_history (INSERT)
│  ├─ id_order = 12345
│  ├─ id_order_state = 9
│  └─ message = "Livré le 08/05/2026"
│
├─ Email client:
│  └─ "Votre commande a été livrée!"
│
└─ API: PUT /api/orders/12345

HISTORIQUE COMPLET (de ps_order_history):
1. État 1 (Attente paiement) - 05/05/2026 14:30
2. État 2 (Paiement accepté) - 05/05/2026 14:31
3. État 4 (Préparation) - 05/05/2026 15:00
4. État 5 (Expédié) - 05/05/2026 16:45
5. État 9 (Livré) - 08/05/2026 10:00
```

---

## 💳 SCÉNARIO 3 : Retour & Remboursement

### Gestion des Retours Produits

```
ÉTAPE 1️⃣ : CLIENT DEMANDE RETOUR
├─ Client dans son compte: "Mes commandes"
├─ Voit commande #12345 (status: Livré)
├─ Clique: "Demander un retour"
├─ Remplit formulaire:
│  ├─ Produit: T-shirt bleu M
│  ├─ Raison: "Taille trop petite"
│  ├─ Qualité: "Bon"
│  └─ Message: "Souhaite échanger pour taille L"
└─ Soumet demande

ÉTAPE 2️⃣ : ENREGISTREMENT RETOUR
├─ Table: ps_order_return (INSERT)
│  ├─ id_order = 12345
│  ├─ id_customer = {id_client}
│  ├─ state = 1 (En attente)
│  ├─ question = "Taille trop petite"
│  ├─ date_add = NOW()
│  └─ Génère: id_order_return
│
├─ Stock RESTE INCHANGÉ (toujours comptabilisé)
├─ Email admin: Nouveau retour demandé
└─ Email client: "Retour enregistré, suivi: #RET001"

ÉTAPE 3️⃣ : ADMIN ÉVALUE LE RETOUR
├─ Admin panel → Retours → RET001
├─ Examine:
│  ├─ Raison retour
│  ├─ État produit
│  ├─ Photo (si envoyée)
│  └─ Demande client
│
├─ Décision:
│  ├─ ✅ Retour accepté
│  │  └─ Table: ps_order_return (UPDATE state = 2)
│  │
│  └─ ❌ Retour refusé
│     └─ Table: ps_order_return (UPDATE state = 3)

ÉTAPE 4️⃣ : RETOUR ACCEPTÉ ✅
├─ Table: ps_order_return (UPDATE)
│  ├─ state = 2 (Accepté)
│  └─ date_upd = NOW()
│
├─ Email client:
│  ├─ Objet: "Votre retour a été accepté"
│  ├─ Contenu: "Merci d'envoyer le produit à..."
│  ├─ Adresse retour
│  └─ "Frais retour à votre charge"
│
├─ Client envoie colis
└─ Prépare à recevoir marchandise

ÉTAPE 5️⃣ : RETOUR REÇU (Marchandise arrive)
├─ Admin reçoit colis
├─ Vérifie: Produit conforme, intact
├─ Table: ps_order_return (UPDATE)
│  ├─ state = 4 (Reçu)
│  └─ date_upd = NOW()
│
├─ STOCK MIS À JOUR:
│  ├─ Table: ps_stock_available (UPDATE)
│  │  ├─ T-shirt bleu M
│  │  ├─ quantity = quantity + 1
│  │  └─ (étaient 0, deviennent 1)
│  │
│  ├─ Table: ps_stock (UPDATE)
│  │  ├─ id_warehouse = {de retour}
│  │  └─ quantity + 1
│  │
│  └─ Table: ps_stock_mvt (INSERT)
│     ├─ quantity = +1
│     ├─ id_stock_mvt_reason = 4 (Retour client)
│     └─ date_add = NOW()
│
└─ Email client: "Votre retour a été reçu et accepté"

ÉTAPE 6️⃣ : GÉNÉRATION BON D'AVOIR
├─ Admin décide: Remboursement ou avoir?
│
├─ CAS 1: REMBOURSEMENT CASH
│  ├─ Table: ps_order_slip (INSERT)
│  │  ├─ id_order = 12345
│  │  ├─ id_customer = {id_client}
│  │  ├─ total_products_tax_excl = 29.99€
│  │  ├─ total_paid_tax_incl = 35.99€ (inc TVA)
│  │  ├─ conversion_rate = 1.0
│  │  └─ date_add = NOW()
│  │
│  ├─ Table: ps_order_payment (INSERT)
│  │  ├─ id_order = 12345
│  │  ├─ amount = -35.99€ (négatif = crédit)
│  │  ├─ payment_method = "Remboursement"
│  │  └─ date_add = NOW()
│  │
│  └─ Remboursement traité (virement bancaire, CB...)
│
├─ CAS 2: BON D'AVOIR
│  ├─ Table: ps_order_slip (UPDATE)
│  │  └─ amount = 35.99€ (crédit boutique)
│  │
│  ├─ Client peut utiliser comme code promo
│  └─ Crédit visible dans son compte

ÉTAPE 7️⃣ : CLÔTURE RETOUR
├─ Table: ps_order_return (UPDATE)
│  ├─ state = 5 (Remboursé)
│  └─ date_upd = NOW()
│
├─ Email client final:
│  ├─ Objet: "Votre remboursement a été traité"
│  ├─ Montant: 35.99€
│  ├─ Moyen: Remboursement carte bancaire
│  ├─ Délai: "3-5 jours ouvrables"
│  └─ Merci pour votre achat
│
└─ Fin du processus retour
```

---

## 🏪 SCÉNARIO 4 : Gestion du Stock (Multi-Entrepôt)

### Stock, Mouvements, et Réappro

```
SITUATION INITIALE:
├─ Produit: T-shirt bleu M
├─ Stock total: 100 unités
├─ Entrepôt Paris: 60 unités
├─ Entrepôt Lyon: 40 unités
└─ Seuil d'alerte: 50 unités

ÉTAPE 1️⃣ : COMMANDES CLIENTS (3 ventes)
├─ 3 clients achètent 1 T-shirt chacun
├─ AVANT PAIEMENT:
│  └─ Stock diminue de -3 (réservé)
│
├─ APRÈS PAIEMENT:
│  ├─ Table: ps_stock_available (UPDATE)
│  │  └─ quantity = 97
│  │
│  ├─ Table: ps_stock (UPDATE)
│  │  ├─ Paris: 57
│  │  └─ Lyon: 40
│  │
│  └─ Table: ps_stock_mvt (INSERT x3)
│     └─ Raison: 3 (Commande client)

ALERTE DÉCLENCHÉ:
├─ Stock = 97 < Seuil (50)?
├─ NON (97 > 50) → Pas encore d'alerte
└─ Continue...

ÉTAPE 2️⃣ : VENTES CONTINUES
├─ 30 autres clients achètent pendant une promo
├─ Stock diminue de -30
├─ Nouveau stock: 67 unités
├─ Table: ps_stock_available (quantity = 67)
├─ Stock Paris: 37, Lyon: 30
└─ Toujours > 50, pas d'alerte

ÉTAPE 3️⃣ : VENTES ACCÉLÉRÉES
├─ Black Friday arrives, 25 ventes rapides
├─ Stock diminue de -25
├─ Nouveau stock: 42 unités ⚠️
├─ ALERTE DÉCLENCHÉ: Stock < 50!
│  └─ Admin reçoit notification
│
├─ Table: ps_stock_available (quantity = 42)
├─ Stock Paris: 12, Lyon: 30
└─ Admin voit: "Stock faible!"

ÉTAPE 4️⃣ : COMMANDE FOURNISSEUR
├─ Admin décide: Commander 200 unités
├─ Fournisseur: Textile Express
├─ Table: ps_supply_order (INSERT)
│  ├─ id_supplier = {id Textile Express}
│  ├─ id_warehouse = 1 (Paris)
│  ├─ reference = "SUP-2026-0001"
│  ├─ date_add = NOW()
│  └─ Génère: id_supply_order
│
├─ Table: ps_supply_order_detail (INSERT)
│  ├─ id_supply_order = {id_sup}
│  ├─ id_product = {id_shirt}
│  ├─ id_product_attribute = {id_blue_M}
│  ├─ quantity_expected = 200
│  ├─ quantity_received = 0
│  ├─ date_expected = "2026-05-12"
│  └─ unit_price_te = 10.00€
│
├─ Table: ps_supply_order_state (INSERT)
│  ├─ status = 1 (Commande créée)
│  └─ Génère notification
│
└─ Stock PRÉ-COMMANDÉ: Marqué dans le système

ÉTAPE 5️⃣ : RÉCEPTION PARTIELLE
├─ Fournisseur envoie 100 unités d'abord
├─ Admin reçoit colis
├─ Table: ps_supply_order_detail (UPDATE)
│  ├─ quantity_received = 100
│  ├─ quantity_expected = 200 (toujours)
│  └─ date_received = NOW()
│
├─ Table: ps_supply_order_receipt_history (INSERT)
│  ├─ id_supply_order_detail = {id}
│  ├─ quantity = 100
│  ├─ date_add = NOW()
│  └─ Enregistre: "100 reçues"
│
├─ Table: ps_supply_order_state (UPDATE)
│  └─ status = 2 (Partiellement reçue)
│
├─ STOCK MIS À JOUR:
│  ├─ Table: ps_stock (UPDATE)
│  │  ├─ id_warehouse = 1 (Paris)
│  │  ├─ quantity = 12 + 100 = 112
│  │  └─ physical_quantity = 112
│  │
│  ├─ Table: ps_stock_available (UPDATE)
│  │  └─ quantity = 42 + 100 = 142
│  │
│  └─ Table: ps_stock_mvt (INSERT)
│     ├─ quantity = +100
│     ├─ id_stock_mvt_reason = 5 (Approvisionnement)
│     └─ date_add = NOW()
│
└─ ✅ ALERTE LEVÉE: Stock = 142 > 50

ÉTAPE 6️⃣ : RÉCEPTION COMPLÈTE
├─ 100 autres unités arrivent
├─ Admin reçoit/enregistre
├─ Table: ps_supply_order_detail (UPDATE)
│  └─ quantity_received = 200 ✅
│
├─ Table: ps_supply_order_receipt_history (INSERT)
│  └─ +100 unités reçues
│
├─ Table: ps_supply_order_state (UPDATE)
│  └─ status = 3 (Complètement reçue)
│
├─ STOCK FINAL:
│  ├─ Stock Paris: 112 + 100 = 212
│  ├─ Stock Total: 242 unités
│  └─ ps_stock_available (quantity = 242)
│
└─ Historique stock complet via ps_stock_mvt

ÉTAPE 7️⃣ : TRANSFERT ENTREPÔT (Optional)
├─ Admin décide: Envoyer 50 unités de Paris à Lyon
├─ (Transfert interne, pas une vente)
├─ Table: ps_stock_mvt (INSERT x2)
│  ├─ D'abord: -50 de Paris
│  │  └─ id_stock_mvt_reason = 6 (Transfert)
│  │
│  └─ Ensuite: +50 à Lyon
│     └─ id_stock_mvt_reason = 6 (Transfert)
│
├─ Table: ps_stock (UPDATE)
│  ├─ Paris: 212 - 50 = 162
│  └─ Lyon: 30 + 50 = 80
│
└─ Stock total inchangé (242)

ÉTAPE 8️⃣ : AJUSTEMENT MANUEL (Perte/Casse)
├─ Admin découvre: 5 T-shirts endommagés
├─ Enregistre: "Perte/casse"
├─ Table: ps_stock_mvt (INSERT)
│  ├─ id_product = {id}
│  ├─ quantity = -5
│  ├─ id_stock_mvt_reason = 2 (Perte)
│  └─ note = "Colis endommagé"
│
├─ Table: ps_stock_available (UPDATE)
│  └─ quantity = 242 - 5 = 237
│
└─ Stock corrigé

STOCK FINAL:
├─ Quantité initiale: 100
├─ - Ventes: -58
├─ + Réappro: 200
├─ - Perte: -5
├─ = 237 unités
└─ Historique complet dans ps_stock_mvt
```

---

## 💰 SCÉNARIO 5 : Réductions & Prix Spéciaux

### Application de Remises Complexes

```
SITUATION:
├─ Produit: Laptop (Prix normal: 1000€)
├─ Client: Pierre Dupont (VIP depuis 2 ans)
├─ Client dans groupe: "VIP" (10% remise)
└─ Date: Vendredi 10 mai (Black Friday)

ÉTAPE 1️⃣ : CONSULTATION PRODUIT
├─ Front: Affiche le prix 1000€
├─ Backend calcul:
│  ├─ Prix de base: ps_product.price = 1000€
│  ├─ Check: ps_specific_price
│  │  └─ WHERE id_product = laptop
│  │  └─ WHERE id_customer = NULL (global)
│  │  └─ WHERE id_group = VIP
│  │  └─ WHERE from_quantity = 1
│  │  └─ WHERE active = 1
│  └─ Cherche: Remise groupe VIP = 10%

REMISE GROUPE VIP APPLIQUÉE:
├─ Table: ps_specific_price
│  ├─ id_product = {laptop}
│  ├─ id_group = {VIP}
│  ├─ reduction = 10
│  ├─ reduction_type = "percentage"
│  └─ price = NULL (remise %)
│
├─ Calcul: 1000€ × (1 - 10%) = 900€
├─ Affichage: 900€ (remise appliquée)
└─ Client voir: "Votre prix VIP: 900€ au lieu de 1000€"

ÉTAPE 2️⃣ : PROMO BLACK FRIDAY
├─ Le site lance aussi une promo Black Friday
├─ -15% sur Électronique
├─ Table: ps_cart_rule (INSERT)
│  ├─ code = "BLACK15"
│  ├─ reduction_percent = 15
│  ├─ id_category = {Électronique}
│  ├─ date_from = "2026-05-10 00:00"
│  ├─ date_to = "2026-05-10 23:59"
│  └─ active = 1
│
└─ Visible en front: Bouton "Ajouter code promo"

ÉTAPE 3️⃣ : PANIER & APPLICATION CODES
├─ Pierre ajoute Laptop: 900€ (prix VIP déjà appliqué)
├─ Panier:
│  ├─ ps_cart (id_cart = 123)
│  └─ ps_cart_detail
│     ├─ id_product = laptop
│     ├─ quantity = 1
│     ├─ price = 900€ (déjà inclus)
│     └─ date_add = NOW()
│
├─ Pierre code: "BLACK15"
├─ Système valide:
│  ├─ Code existe: BLACK15 ✓
│  ├─ Valide aujourd'hui: ✓
│  ├─ Pas expiré: ✓
│  ├─ Quantité min: ✓
│  └─ S'applique: Électronique ✓
│
├─ CALCUL REMISE SUPPLÉMENTAIRE:
│  ├─ Prix après remise VIP: 900€
│  ├─ Black Friday -15%: 900€ × 15% = 135€
│  └─ Nouveau total: 900€ - 135€ = 765€
│
├─ Table: ps_order_cart_rule (si commande)
│  ├─ id_cart_rule = {BLACK15}
│  ├─ name = "Black Friday -15%"
│  ├─ value = 135€
│  └─ free_shipping = 0
│
└─ Affichage panier:
   ├─ Laptop (VIP): 900€
   ├─ - Remise VIP: -0€ (déjà dans le prix)
   ├─ - Code BLACK15: -135€
   ├─ = Montant final: 765€
   └─ Économies: 235€ (23.5%)

ÉTAPE 4️⃣ : COMMANDE CRÉÉE
├─ Pierre valide la commande
├─ Table: ps_orders (INSERT)
│  ├─ total_paid = 765€
│  └─ valid = 1
│
├─ Table: ps_order_detail (INSERT)
│  ├─ product_price = 900€ (prix VIP vendu)
│  ├─ product_quantity = 1
│  └─ product_total = 900€
│
├─ Table: ps_order_cart_rule (INSERT)
│  ├─ id_order = {id}
│  ├─ id_cart_rule = {BLACK15}
│  ├─ name = "Black Friday"
│  └─ value = 135€
│
└─ Historique remises complet

PRIX FINAUX:
├─ Prix affiché: 1000€ (public)
├─ Prix VIP (groupe): 900€ (-100€)
├─ Prix Black Friday: 765€ (-135€ supplémentaires)
├─ Total économies: -235€
└─ Taux remise: 23.5%

ÉTAPE 5️⃣ : BONUS - RÈGLE DE PRIX DYNAMIQUE
├─ Si Pierre avait acheté 3 Laptops:
│  └─ Table: ps_specific_price_rule
│     ├─ id_product = laptop
│     ├─ name = "3+ laptops = -20%"
│     ├─ from_quantity = 3
│     ├─ reduction = 20
│     ├─ reduction_type = "percent"
│     └─ active = 1
│
├─ Calcul avec quantité:
│  ├─ Prix unitaire: 900€ (VIP)
│  ├─ Quantité: 3
│  ├─ Remise qty: -20% supplémentaire
│  ├─ Nouveau: 900€ × 0.8 = 720€/unité
│  ├─ Total: 720€ × 3 = 2160€
│  ├─ Black Friday -15%: 2160€ × 0.15 = 324€
│  └─ Montant final: 1836€
│
└─ Économies totales: 1000€ × 3 - 1836€ = 1164€ (38.8%)
```

---

## 📊 RÉSUMÉ DES WORKFLOWS

```
WORKFLOW 1: Achat Simple
├─ Guest → Login/Register
├─ Browse Catalog
├─ Add to Cart
├─ Checkout (Address, Shipping, Payment)
├─ Create Order
├─ Stock Decrease
└─ Order Complete ✅

WORKFLOW 2: Admin Management
├─ Receive Order Notification
├─ Verify & Prepare
├─ Change to "Preparing"
├─ Add Tracking & Ship
├─ Generate Invoice
├─ Update to "Shipped"
├─ Confirm Delivery
└─ Order Closed ✅

WORKFLOW 3: Returns & Refunds
├─ Customer Requests Return
├─ Admin Approves
├─ Customer Ships Back
├─ Goods Received
├─ Stock Restored
├─ Generate Credit Slip
└─ Refund Processed ✅

WORKFLOW 4: Stock Management
├─ Monitor Stock Levels
├─ Trigger Reorder at Threshold
├─ Place Supply Order
├─ Receive Goods (Partial/Full)
├─ Update Inventory
├─ Move Between Warehouses
└─ Stock Reconciled ✅

WORKFLOW 5: Pricing & Discounts
├─ Base Product Price
├─ Apply Customer Group Discount
├─ Apply Cart Rule/Coupon
├─ Apply Quantity-Based Discount
├─ Calculate Final Price
├─ Record Discounts Applied
└─ Order with Correct Pricing ✅
```

---

**Version** : PrestaShop 8.2.6  
**Workflows** : 5 scénarios complets  
**Tables impliquées** : 40+  
**Réalisme** : 100% (basé sur processus réel)

