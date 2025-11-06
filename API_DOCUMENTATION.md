# API Documentation - Neural-Enhanced Spaced Repetition

## Base URL
```
Development: http://localhost:8080/api
Production: TBD
```

## Authentication

All question endpoints require JWT authentication.

Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### Authentication

#### Register User
```http
POST /api/users
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "id": "user_id",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Learning Flow

#### Get Next Question
Returns the next question in the review queue.

```http
GET /api/questions/next
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "question": "casa",
  "questionId": 0,
  "totalQuestions": 30,
  "stats": {
    "totalReviews": 25,
    "correctAnswers": 18,
    "currentStreak": 3
  }
}
```

#### Submit Answer
Submit answer and get feedback with next interval.

```http
POST /api/questions/answer
Authorization: Bearer <token>
Content-Type: application/json

{
  "answer": "house",
  "responseTime": 3200
}
```

**Parameters:**
- `answer` (string, required): User's answer to the question
- `responseTime` (number, required): Time to answer in milliseconds

**Response (200):**
```json
{
  "correct": true,
  "correctAnswer": "house",
  "feedback": {
    "correct": true,
    "intervalUsed": 6,
    "algorithmUsed": "baseline",
    "baselineInterval": 6,
    "mlInterval": null,
    "nextReviewDate": "2025-11-10T00:00:00.000Z",
    "quality": 4,
    "stats": {
      "consecutiveCorrect": 3,
      "successRate": 0.857,
      "totalReviews": 7
    }
  },
  "nextQuestion": "perro",
  "stats": {
    "totalReviews": 26,
    "correctAnswers": 19,
    "currentStreak": 4
  }
}
```

**Feedback Explanation:**
- `intervalUsed`: Days until next review (what was actually applied)
- `algorithmUsed`: "baseline" or "ml"
- `baselineInterval`: What SM-2 algorithm predicted
- `mlInterval`: What ML model predicted (null if not available)
- `quality`: SM-2 quality rating (0-5)
  - 0: Complete blackout
  - 1: Incorrect, recognized on seeing answer
  - 2: Incorrect, seemed easy
  - 3: Correct with difficulty
  - 4: Good recall
  - 5: Perfect recall

---

### Statistics & Analytics

#### Get Algorithm Comparison
Compare baseline vs ML algorithm performance.

```http
GET /api/questions/stats/comparison
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "comparison": {
    "baseline": {
      "totalReviews": 50,
      "retentionRate": 0.78,
      "avgInterval": 4.2,
      "avgResponseTime": 3100
    },
    "ml": {
      "totalReviews": 25,
      "retentionRate": 0.84,
      "avgInterval": 5.1,
      "avgResponseTime": 2800
    },
    "improvement": {
      "retentionRate": 0.06,
      "avgInterval": 0.9,
      "reviewsNeeded": 25
    }
  },
  "mlReadiness": {
    "ready": false,
    "totalReviews": 75,
    "cardsWithHistory": 15,
    "minimumReviews": 100,
    "minimumCards": 10,
    "message": "Complete 25 more reviews to enable ML predictions"
  },
  "currentMode": "baseline"
}
```

**ML Readiness:**
- `ready`: true when user has enough data to train ML model
- Minimum 100 total reviews
- Minimum 10 cards with at least 2 reviews each

#### Get User Progress
Detailed progress for all cards.

```http
GET /api/questions/progress
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "stats": {
    "totalReviews": 75,
    "correctAnswers": 58,
    "incorrectAnswers": 17,
    "currentStreak": 5,
    "longestStreak": 12,
    "lastStudyDate": "2025-11-04T18:30:00.000Z"
  },
  "cards": [
    {
      "question": "casa",
      "timesCorrect": 5,
      "timesIncorrect": 1,
      "successRate": 0.833,
      "consecutiveCorrect": 3,
      "memoryStrength": 12,
      "lastReviewed": "2025-11-02T10:00:00.000Z"
    }
    // ... more cards
  ],
  "totalCards": 30,
  "masteredCards": 8
}
```

**Card Mastery:**
- A card is considered "mastered" when `consecutiveCorrect >= 3`

---

### Settings

#### Update Algorithm Settings
Change which algorithm to use.

```http
PATCH /api/questions/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "algorithmMode": "ab-test",
  "dailyGoal": 15
}
```

**Parameters:**
- `algorithmMode` (string, optional): "baseline" | "ml" | "ab-test"
  - `baseline`: Always use SM-2 algorithm
  - `ml`: Always use ML predictions (requires enough training data)
  - `ab-test`: Randomly split cards between both algorithms
- `dailyGoal` (number, optional): Target number of reviews per day

**Response (200):**
```json
{
  "message": "Settings updated",
  "settings": {
    "algorithmMode": "ab-test",
    "useMLAlgorithm": true,
    "dailyGoal": 15
  }
}
```

---

## SM-2 Algorithm Details

The baseline algorithm uses the SuperMemo SM-2 spaced repetition algorithm:

### Quality Ratings
Based on answer correctness and response time:

| Response Time | Correct | Quality | Next Interval |
|---------------|---------|---------|---------------|
| Very Fast (<50% avg) | Yes | 5 | Maximum increase |
| Fast (50-100% avg) | Yes | 4 | Standard increase |
| Slow (>100% avg) | Yes | 3 | Moderate increase |
| Slow (>5s) | No | 2 | Reset to 1 day |
| Medium (1-5s) | No | 1 | Reset to 1 day |
| Very Fast (<1s) | No | 0 | Reset to 1 day |

### Interval Calculation
```
If quality < 3:
  repetitions = 0
  interval = 1 day

If quality >= 3:
  repetitions++
  easeFactor = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))

  If repetitions == 1: interval = 1 day
  If repetitions == 2: interval = 6 days
  If repetitions > 2:  interval = previous_interval * easeFactor
```

### Ease Factor
- Starts at 2.5
- Adjusted based on performance
- Minimum value: 1.3
- Higher ease factor = faster interval growth

---

## Error Responses

### 400 Bad Request
```json
{
  "status": 400,
  "message": "Missing answer in request body"
}
```

### 401 Unauthorized
```json
{
  "status": 401,
  "message": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "status": 404,
  "message": "User not found"
}
```

### 500 Server Error
```json
{
  "status": 500,
  "message": "Internal server error"
}
```

---

## Usage Flow Example

### 1. Create Account
```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo",
    "password": "password",
    "firstName": "Demo",
    "lastName": "User"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo",
    "password": "password"
  }'
```

### 3. Get Question
```bash
curl http://localhost:8080/api/questions/next \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Submit Answer
```bash
curl -X POST http://localhost:8080/api/questions/answer \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answer": "house",
    "responseTime": 3200
  }'
```

### 5. Check Progress
```bash
curl http://localhost:8080/api/questions/progress \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6. Enable ML (after 100+ reviews)
```bash
curl -X PATCH http://localhost:8080/api/questions/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "algorithmMode": "ml"
  }'
```

---

## Data Collection for ML

The system automatically collects training data from every review:
- User performance history
- Response times
- Success rates
- Review intervals and outcomes

This data is used to train the neural network model once enough reviews are completed (minimum 100 reviews across 10+ cards).

---

## WebGPU Integration

When the ML model is enabled, predictions use WebGPU acceleration for:
- 10-100x faster inference
- Real-time interval calculations
- Client-side personalized predictions

Performance metrics are tracked and displayed in the comparison stats.
