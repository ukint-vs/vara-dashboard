import React, { useState, useEffect } from 'react';
import { Form, Grid, Label, Icon } from 'semantic-ui-react';
import { TxButton } from './substrate-lib/components';
import { useSubstrateState } from './substrate-lib';
import { formatBalance } from '@polkadot/util';
import BN from 'bn.js';

export default function Vesting(props) {
  const { api, currentAccount } = useSubstrateState();
  const [vestingInfo, setVestingInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [vestedBalance, setVestedBalance] = useState(new BN(0));
  const [totalLocked, setTotalLocked] = useState(new BN(0));
  const [remainingLocked, setRemainingLocked] = useState(new BN(0));

  // Set global options for formatBalance
  formatBalance.setDefaults({
    decimals: 12,
    unit: 'VARA', // Replace 'Unit' with your chain's base unit, e.g., 'DOT'
  });

  useEffect(() => {
    let unsubVesting = null;
    let unsubBlock = null;

    const fetchVestingInfo = async () => {
      if (!api || !currentAccount) return;

      // Fetch vesting schedules
      unsubVesting = await api.query.vesting.vesting(currentAccount.address, (result) => {
        setVestingInfo(result.isSome ? result.unwrap() : null);
      });
      

      // Fetch current block number
      unsubBlock = await api.derive.chain.bestNumber((number) => {
        setCurrentBlock(number.toNumber());
      });
    };

    fetchVestingInfo();

    return () => {
        
      if (unsubVesting) unsubVesting();
      if (unsubBlock) unsubBlock();
    };
  }, [api, currentAccount]);

  useEffect(() => {
    if (!vestingInfo || currentBlock === 0) {
      setVestedBalance(new BN(0));
      return;
    }
    
    let totalVested = new BN(0);

    const schedules = Array.isArray(vestingInfo) ? vestingInfo : [vestingInfo];

    schedules.forEach((schedule) => {
      const locked = new BN(schedule.locked);
      const perBlock = new BN(schedule.perBlock);
      const startingBlock = new BN(schedule.startingBlock);

      const elapsedBlocks = new BN(currentBlock).sub(startingBlock);

      if (elapsedBlocks.lte(new BN(0))) {
        // Vesting hasn't started yet
        return;
      }

      const vestedAmount = perBlock.mul(elapsedBlocks);
      const unlockable = BN.min(vestedAmount, locked);

      totalVested = totalVested.add(unlockable);
    });

    setVestedBalance(totalVested);
  }, [vestingInfo, currentBlock]);

  useEffect(() => {
    if (!vestingInfo) {
      setTotalLocked(new BN(0));
      setRemainingLocked(new BN(0));
      return;
    }

    let totalLockedAmount = new BN(0);

    const schedules = Array.isArray(vestingInfo) ? vestingInfo : [vestingInfo];

    schedules.forEach((schedule) => {
      const locked = new BN(schedule.locked);
      totalLockedAmount = totalLockedAmount.add(locked);
    });

    const remaining = totalLockedAmount.sub(vestedBalance);
    setTotalLocked(totalLockedAmount);
    setRemainingLocked(remaining);
  }, [vestingInfo, vestedBalance]);

  return (
    <Grid.Column width={8}>
      <h1>Vesting</h1>
      <Form>
        <Form.Field>
          <Label basic color="teal">
            <Icon name="info circle" />
            Vesting Information
          </Label>
        </Form.Field>

        <Form.Field>
          {vestingInfo ? (
            <>
              <Label basic color="blue">
                <Icon name="lock" />
                Total Locked: {formatBalance(totalLocked, { withSi: true })}
              </Label>
              <Label basic color="green">
                <Icon name="unlock alternate" />
                Amount to be unlocked: {formatBalance(vestedBalance, { withSi: true })}
              </Label>
              <Label basic color="red">
                <Icon name="lock" />
                Remaining Locked: {formatBalance(remainingLocked, { withSi: true })}
              </Label>
            </>
          ) : (
            <p>No vesting schedules found for this account.</p>
          )}
        </Form.Field>

        <Form.Field style={{ textAlign: 'center' }}>
          <TxButton
            label="Unlock Vested Tokens"
            type="SIGNED-TX"
            setStatus={setStatus}
            attrs={{
              palletRpc: 'vesting',
              callable: 'vest',
              inputParams: [],
              paramFields: [],
            }}
          />
        </Form.Field>
        <div style={{ overflowWrap: 'break-word' }}>{status}</div>
      </Form>
    </Grid.Column>
  );
}