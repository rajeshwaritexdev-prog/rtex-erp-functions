const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { configDotenv } = require('dotenv');

const app = express();

// Allow requests from your React frontend
app.use(cors());
app.use(express.json());
configDotenv(); // Load environment variables from .env file (for local development)

// 1. Global variable to cache the MongoDB connection
let cachedDb = null;

async function connectToDatabase() {
  // If we already have a connection, reuse it
  if (cachedDb) {
    return cachedDb;
  }

  // Connect using the environment variable set in AWS Lambda
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();

  // Extracts the specific database name from your connection string
  cachedDb = client.db();

  // Seed varieties if they don't exist
  try {
    const varietiesCount = await cachedDb.collection('varieties').countDocuments();
    if (varietiesCount === 0) {
      await cachedDb.collection('varieties').insertMany([
        { variety_id: '01', variety_name: 'L kaavi - mla karai', yarn_count: '2/40', warp_ends: 2670, colour: 'marron, military green', loom_id: '06', type: 'Veshti' },
        { variety_id: '02', variety_name: 'Eerazhai - kambi karai', yarn_count: '40C', warp_ends: 2670, colour: 'blue, white', loom_id: '07', type: 'Veshti' },
        { variety_id: '03', variety_name: 'Plain weave - special', yarn_count: '60C', warp_ends: 3000, colour: 'red, yellow', loom_id: '08', type: 'Towel' }
      ]);
      console.log('Seeded varieties collection');
    }
  } catch (e) {
    console.error("Error seeding varieties:", e);
  }

  // Ensure all existing beams have a default type of 'Veshti' if missing
  try {
    await cachedDb.collection('beams').updateMany(
      { type: { $exists: false } },
      { $set: { type: 'Veshti' } }
    );
  } catch (e) {
    console.error("Error backfilling beam type:", e);
  }

  // Ensure all existing varieties have a default type of 'Veshti' if missing
  try {
    await cachedDb.collection('varieties').updateMany(
      { type: { $exists: false } },
      { $set: { type: 'Veshti' } }
    );
  } catch (e) {
    console.error("Error backfilling variety type:", e);
  }

  return cachedDb;
}

// 1b. Helper function for dynamic status
function calculateDynamicStatus(remainingMtr, allocatedAt, isAllocated, type) {
  // If no beam is allocated, a Loom is always Idle
  if (type === 'loom' && !isAllocated) {
    return 'Idle';
  }

  if (remainingMtr === 0) {
    return type === 'loom' ? 'Idle' : 'Complete';
  }

  if (remainingMtr > 0 && remainingMtr < 800) {
    return 'Low';
  }

  // If we reach here, remainingMtr >= 800
  if (!isAllocated) {
    return 'Available'; // Only applies to Beam, as Loom is caught above
  }

  if (allocatedAt) {
    const allocatedTime = new Date(allocatedAt).getTime();
    const now = new Date().getTime();
    const hoursElapsed = (now - allocatedTime) / (1000 * 60 * 60);

    if (hoursElapsed < 6) {
      return 'Just allocated';
    } else {
      return 'Running';
    }
  }

  return 'Running';
}

// 2. Define your endpoints just like a normal Express app
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is fully operational and ready to serve requests' });
});

app.get('/api/beams', async (req, res) => {
  try {
    const db = await connectToDatabase();

    const beams = await db.collection('beams').aggregate([
      {
        $lookup: {
          from: 'varieties',
          localField: 'variety_id',
          foreignField: 'variety_id',
          as: 'variety_info'
        }
      },
      {
        $unwind: {
          path: '$variety_info',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          beamId: '$beam_id',
          purchaseDate: '$purchase_date',
          type: { $ifNull: ['$type', 'Veshti'] },
          varietyId: '$variety_id',
          variety: '$variety_info.variety_name',
          yarnCount: '$variety_info.yarn_count',
          warpEnds: '$warp_ends',
          purchaseMtr: '$purchased_mtr',
          remainingMtr: '$remaining_mtr',
          loom: '$loom',
          allocatedAt: '$allocated_at',
          createdAt: '$created_at'
        }
      }
    ]).toArray();

    const beamsWithDynamicStatus = beams.map(beam => {
      const isAllocated = beam.loom && beam.loom !== "Yet to be allocated";
      const status = calculateDynamicStatus(beam.remainingMtr, beam.allocatedAt, isAllocated, 'beam');

      let isNewlyAdded = false;
      if (!isAllocated && beam.createdAt) {
        const createdTime = new Date(beam.createdAt).getTime();
        const now = new Date().getTime();
        if ((now - createdTime) / (1000 * 60 * 60) < 6) {
          isNewlyAdded = true;
        }
      }

      return { ...beam, status, isNewlyAdded };
    });

    res.json({ data: beamsWithDynamicStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/varieties', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const varieties = await db.collection('varieties').aggregate([
      {
        $project: {
          _id: 0,
          varietyID: '$variety_id',
          varietyName: '$variety_name',
          type: { $ifNull: ['$type', 'Veshti'] },
          yarnCount: '$yarn_count',
          warpEnds: '$warp_ends',
          colour: '$colour',
          loomID: '$loom_id'
        }
      }
    ]).toArray();
    res.json({ data: varieties });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/looms', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const looms = await db.collection('looms').aggregate([
      {
        $lookup: {
          from: 'beams',
          localField: 'beam_id',
          foreignField: 'beam_id',
          as: 'beam_info'
        }
      },
      {
        $unwind: {
          path: '$beam_info',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          loomNumber: '$loom_number',
          beamId: '$beam_id',
          variety: '$variety',
          remainingMtr: '$beam_info.remaining_mtr',
          allocatedAt: '$beam_info.allocated_at'
        }
      }
    ]).toArray();

    const loomsWithDynamicStatus = looms.map(loom => {
      const isAllocated = !!loom.beamId && loom.beamId !== 'none';
      const status = calculateDynamicStatus(loom.remainingMtr, loom.allocatedAt, isAllocated, 'loom');
      return {
        loomNumber: loom.loomNumber,
        beamId: loom.beamId,
        variety: loom.variety,
        status: status
      };
    });

    res.json({ data: loomsWithDynamicStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/looms', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const newLoom = req.body;

    if (!newLoom.loomNumber) {
      return res.status(400).json({ error: "Loom number is required" });
    }

    const loomToInsert = {
      loom_number: newLoom.loomNumber,
      beam_id: newLoom.beamId,
      variety: newLoom.variety
    };

    await db.collection('looms').insertOne(loomToInsert);

    // Update the allocated beam if one was selected
    if (newLoom.beamId) {
      await db.collection('beams').updateOne(
        { beam_id: newLoom.beamId },
        { $set: { loom: newLoom.loomNumber, allocated_at: new Date().toISOString() } }
      );
    }

    // Calculate initial dynamic status to return to frontend
    const isAllocated = !!newLoom.beamId && newLoom.beamId !== 'none';
    // When just created, if a beam was allocated, we assume it has full length and it was just allocated now
    const initialStatus = isAllocated ? 'Just allocated' : 'Idle';

    const responseData = {
      loomNumber: loomToInsert.loom_number,
      beamId: loomToInsert.beam_id,
      variety: loomToInsert.variety,
      status: initialStatus
    };

    res.json({ message: "success", data: responseData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to insert loom due to a database error." });
  }
});

app.put('/api/looms/:loomNumber', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { loomNumber } = req.params;
    const { beamId, variety } = req.body;

    // Find the existing loom
    const oldLoom = await db.collection('looms').findOne({ loom_number: loomNumber });
    if (!oldLoom) {
      return res.status(404).json({ error: "Loom not found" });
    }

    // 1. If old beam exists and is different, unallocate it
    if (oldLoom.beam_id && oldLoom.beam_id !== 'none' && oldLoom.beam_id !== beamId) {
      await db.collection('beams').updateOne(
        { beam_id: oldLoom.beam_id },
        { $set: { loom: 'Yet to be allocated', allocated_at: null } }
      );
    }

    // 2. If new beam is provided and is different, allocate it
    if (beamId && beamId !== 'none' && beamId !== oldLoom.beam_id) {
      await db.collection('beams').updateOne(
        { beam_id: beamId },
        { $set: { loom: loomNumber, allocated_at: new Date().toISOString() } }
      );
    }

    // 3. Update the loom document
    await db.collection('looms').updateOne(
      { loom_number: loomNumber },
      { $set: { beam_id: beamId, variety: variety } }
    );

    // Return updated fields (status will be dynamically calculated on fetch, but we can pass a dummy/initial state)
    res.json({ message: "success", data: { loomNumber, beamId, variety } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update loom due to a database error." });
  }
});

app.post('/api/beams', async (req, res) => {
  try {
    const beams = Array.isArray(req.body) ? req.body : req.body.beams;
    if (!beams || !beams.length) {
      return res.status(400).json({ error: "No beams provided" });
    }

    const db = await connectToDatabase();

    const beamsToInsert = beams.map(beam => {
      const variety_id = beam.varietyID || beam.varietyId;
      const purchase_date = beam.purchaseDate || new Date().toISOString().split('T')[0];
      return {
        beam_id: beam.beamId,
        purchase_date: purchase_date,
        created_at: new Date().toISOString(),
        variety_id: variety_id,
        type: beam.type || "Veshti",
        warp_ends: beam.warpEnds,
        purchased_mtr: parseFloat(beam.purchaseMtr),
        remaining_mtr: parseFloat(beam.purchaseMtr),
        status: "available",
        loom: "Yet to be allocated"
      };
    });

    const beamIds = beamsToInsert.map(b => b.beam_id);
    const existing = await db.collection('beams').findOne({ beam_id: { $in: beamIds } });
    if (existing) {
      return res.status(500).json({ error: "Failed to insert beams due to a database error. Check if the beam ID already exists." });
    }

    await db.collection('beams').insertMany(beamsToInsert);
    res.json({ message: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to insert beams due to a database error. Check if the beam ID already exists." });
  }
});

app.put('/api/beams/:beamId', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { beamId: paramBeamId } = req.params;
    const { purchaseDate, beamId, purchaseMtr, type, varietyId, warpEnds } = req.body;

    const oldBeam = await db.collection('beams').findOne({ beam_id: paramBeamId });
    if (!oldBeam) {
      return res.status(404).json({ error: "Beam not found" });
    }

    if (beamId && beamId !== paramBeamId) {
      const existing = await db.collection('beams').findOne({ beam_id: beamId });
      if (existing) {
        return res.status(400).json({ error: "New Beam ID already exists" });
      }
    }

    const updateFields = {};
    if (purchaseDate) updateFields.purchase_date = purchaseDate;
    if (beamId) updateFields.beam_id = beamId;
    if (purchaseMtr !== undefined && purchaseMtr !== '') {
      const newMtr = parseFloat(purchaseMtr);
      if (oldBeam.remaining_mtr === oldBeam.purchased_mtr) {
        updateFields.remaining_mtr = newMtr;
      }
      updateFields.purchased_mtr = newMtr;
    }
    if (type) updateFields.type = type;
    if (varietyId) {
      updateFields.variety_id = varietyId;
      const varietyDoc = await db.collection('varieties').findOne({ variety_id: varietyId });
      if (varietyDoc && varietyDoc.warp_ends) {
        updateFields.warp_ends = varietyDoc.warp_ends;
      }
    }
    if (warpEnds) updateFields.warp_ends = warpEnds;

    await db.collection('beams').updateOne(
      { beam_id: paramBeamId },
      { $set: updateFields }
    );

    if (beamId && beamId !== paramBeamId) {
      await db.collection('looms').updateMany(
        { beam_id: paramBeamId },
        { $set: { beam_id: beamId } }
      );
    }

    res.json({ message: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update beam" });
  }
});

app.delete('/api/beams/:beamId', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { beamId } = req.params;

    await db.collection('looms').updateMany(
      { beam_id: beamId },
      { $set: { beam_id: null, status: 'Idle' } }
    );

    const result = await db.collection('beams').deleteOne({ beam_id: beamId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Beam not found" });
    }

    res.json({ message: "success" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete beam" });
  }
});

if (require.main === module) {
  const PORT = 9000;
  app.listen(PORT, () => {
    console.log(`Local backend running at http://localhost:${PORT}`);
  }).on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}


// 3. Wrap and export the Express app for AWS Lambda
module.exports.handler = serverless(app);

