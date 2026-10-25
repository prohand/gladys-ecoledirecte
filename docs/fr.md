# EcoleDirecte

Cette intégration relie Gladys à **EcoleDirecte**, l'espace numérique de travail
de nombreux collèges et lycées. Elle lit, pour chaque enfant suivi par le compte :
les notes et la moyenne, les devoirs, l'emploi du temps, les absences et retards,
et la messagerie.

Elle passe par internet (badge **cloud**) : il n'y a rien à installer sur votre
réseau. Elle nécessite **Gladys 5.3.0 ou plus**.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**identifiant** et le **mot de passe** que vous tapez sur
   [ecoledirecte.com](https://www.ecoledirecte.com). Un compte **parent** donne
   tous les enfants ; un compte **élève** donne l'élève lui-même.
3. Réglages facultatifs :
   - **Intervalle de rafraîchissement** : toutes les 30 minutes par défaut
     (10 minutes au minimum) ;
   - **Fuseau horaire de l'établissement** : `Europe/Paris` par défaut. À changer
     seulement hors métropole (`America/Martinique`, `Indian/Reunion`…) ;
   - **Langue des noms d'appareils** : la langue des noms écrits à la création
     des appareils.
4. Enregistrez, puis cliquez sur **Tester la connexion**.

### La question de sécurité

La première fois, EcoleDirecte demande souvent de confirmer l'appareil avec une
question (par exemple « Quelle est votre année de naissance ? »). L'état de
l'intégration l'indique. Dans ce cas :

1. cliquez sur **Obtenir la question de sécurité** : la question et les réponses
   possibles, numérotées, s'affichent sous le bouton ;
2. dans les 10 minutes, tapez le **numéro** de la bonne réponse (ou son texte)
   dans **Répondre à la question de sécurité**.

La réponse est gardée par l'intégration : la question n'est plus posée aux
démarrages suivants. Si EcoleDirecte la repose un jour, refaites ces deux
étapes.

## Les appareils

Chaque enfant apparaît dans l'onglet **Découverte** ; ajoutez-le. Ses
fonctionnalités :

| Fonctionnalité      | Contenu                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Moyenne générale    | Moyenne de la période en cours (sur 20)                            |
| Dernière note (/20) | Dernière note saisie, ramenée sur 20                               |
| Dernière note       | En texte : « MATHEMATIQUES : 15/20 (Contrôle chap. 3) »            |
| Devoirs pour demain | Nombre de devoirs non faits pour demain                            |
| Devoirs à faire     | Nombre de devoirs non faits à venir                                |
| Prochain cours      | « 08:00 MATHEMATIQUES (S12) », le jour si ce n'est pas aujourd'hui |
| Absences / Retards  | Nombre sur l'année scolaire                                        |
| Messages non lus    | Messages non lus de la messagerie du compte                        |

Quand l'établissement désactive un module (par exemple les notes), la
fonctionnalité correspondante reste vide. Si l'établissement ne publie pas la
moyenne générale, l'intégration la calcule à partir des notes : moyenne de
chaque matière (avec les coefficients), puis moyenne des matières.

## Scènes (Gladys 5.1 ou plus)

### Déclencheurs

- **Nouvelle note** : variables `subject`, `assignment`, `grade`, `out_of`,
  `grade_20`, `date`, `student_name`.
- **Nouveau devoir** : `subject`, `due_date`, `is_test`.
- **Nouvelle absence ou retard** : filtre sur le type ; `kind`, `date`,
  `label`, `justified`.
- **Cours annulé** : un cours à venir annulé ; `subject`, `date`, `start`, `end`,
  `teacher`.
- **Nouveau message** : `from`, `subject`, `date`.

Chacun peut être filtré sur un élève. Au premier démarrage, l'intégration
enregistre ce qui existe déjà sans rien déclencher.

### Actions

- **Actualiser EcoleDirecte** : lit EcoleDirecte tout de suite.
- **Lire les devoirs** (aujourd'hui, demain, prochain jour de classe) : `count`,
  `tests`, `subjects`, `summary` (le contenu des devoirs, à envoyer par message).
- **Lire l'emploi du temps** : `has_lessons`, `first_start`, `first_subject`,
  `last_end`, `lesson_count`, `cancelled_count` — de quoi régler le réveil sur
  le premier cours.

Exemple : chaque soir à 19 h, « Lire les devoirs » pour demain, puis envoyer
`summary` sur Telegram si `count` est supérieur à 0.

## Widgets (Gladys 5.1 ou plus)

- **Suivi scolaire** : moyenne, dernière note, devoirs de demain et messages non
  lus en direct, prochain cours, absences et retards.
- **Devoirs** : les devoirs à faire, avec leur contenu.
- **Emploi du temps** : les cours d'un jour, cours annulés signalés.

Choisissez l'élève dans les réglages du widget.

## En cas de problème

- « EcoleDirecte a refusé l'identifiant ou le mot de passe » : vérifiez-les sur
  ecoledirecte.com.
- « L'établissement n'est pas disponible » : EcoleDirecte coupe souvent l'accès
  pendant les vacances ; l'intégration réessaie toute seule.
- « EcoleDirecte a refusé la version d'API » : mettez l'intégration à jour.
- Les logs de l'intégration n'affichent jamais le mot de passe.
