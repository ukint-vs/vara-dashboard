import React, { useState, useEffect } from 'react'
import { Form, Grid, Label, Icon } from 'semantic-ui-react'
import { TxButton } from './substrate-lib/components'
import { useSubstrateState } from './substrate-lib'
import { formatBalance } from '@polkadot/util'
import BN from 'bn.js'

export default function Vesting(props) {
  const { api, currentAccount } = useSubstrateState()
  const [vestingInfo, setVestingInfo] = useState(null)
  const [status, setStatus] = useState(null)
  const [currentBlock, setCurrentBlock] = useState(0)
  const [totalLocked, setTotalLocked] = useState(new BN(0))
  const [vestingLocked, setVestingLocked] = useState(new BN(0))
  const [totalVested, setTotalVested] = useState(new BN(0))
  const [amountClaimedBefore, setAmountClaimedBefore] = useState(new BN(0))
  const [amountToUnlock, setAmountToUnlock] = useState(new BN(0))

  // Set global options for formatBalance
  formatBalance.setDefaults({
    decimals: 12,
    unit: 'VARA', // Replace 'Unit' with your chain's base unit, e.g., 'DOT'
  })

  useEffect(() => {
    let unsubVesting = null
    let unsubLocks = null
    let unsubBlock = null

    const fetchData = async () => {
      if (!api || !currentAccount) return

      // Fetch vesting schedules
      unsubVesting = await api.query.vesting.vesting(
        currentAccount.address,
        result => {
          const vesting = result.isSome ? result.unwrap() : null
          setVestingInfo(vesting ? vesting : null)

          // Calculate Total Locked
          if (vesting) {
            const schedules = Array.isArray(vesting) ? vesting : [vesting]
            let total = new BN(0)
            schedules.forEach(schedule => {
              total = total.add(new BN(schedule.locked.toString()))
            })
            setTotalLocked(total)
          } else {
            setTotalLocked(new BN(0))
          }
        }
      )

      // Fetch balance locks
      unsubLocks = await api.query.balances.locks(
        currentAccount.address,
        locks => {
          const vestingLock = locks.find(
            lock => lock.id.toHuman() === 'vesting '
          )
          if (vestingLock) {
            setVestingLocked(vestingLock.amount.toBn())
          } else {
            setVestingLocked(new BN(0))
          }
        }
      )

      // Fetch current block number
      unsubBlock = await api.derive.chain.bestNumber(number => {
        setCurrentBlock(number.toNumber())
      })
    }

    fetchData()

    return () => {
      if (unsubVesting) unsubVesting()
      if (unsubLocks) unsubLocks()
      if (unsubBlock) unsubBlock()
    }
  }, [api, currentAccount])

  useEffect(() => {
    if (!vestingInfo || currentBlock === 0) {
      setTotalVested(new BN(0))
      return
    }

    let totalVestedAmount = new BN(0)

    const schedules = Array.isArray(vestingInfo) ? vestingInfo : [vestingInfo]

    schedules.forEach(schedule => {
      const locked = new BN(schedule.locked)
      const perBlock = new BN(schedule.perBlock)
      const startingBlock = new BN(schedule.startingBlock)

      const elapsedBlocks = new BN(currentBlock).sub(startingBlock)

      if (elapsedBlocks.lte(new BN(0))) {
        // Vesting hasn't started yet
        return
      }

      const vestedAmount = BN.min(perBlock.mul(elapsedBlocks), locked)

      totalVestedAmount = totalVestedAmount.add(vestedAmount)
    })

    setTotalVested(totalVestedAmount)
  }, [vestingInfo, currentBlock])

  useEffect(() => {
    if (totalVested.isZero()) {
      setAmountClaimedBefore(new BN(0))
      return
    }

    const claimedAmount = totalLocked.sub(vestingLocked)
    setAmountClaimedBefore(claimedAmount)
  }, [totalVested, vestingLocked])

  useEffect(() => {
    if (totalVested.isZero()) {
      setAmountToUnlock(new BN(0))
      return
    }

    const toUnlock = totalVested.sub(amountClaimedBefore)
    setAmountToUnlock(toUnlock)
  }, [totalVested, amountClaimedBefore])

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
              <Label basic color="grey">
                <Icon name="block layout" />
                Current Block: {currentBlock}
              </Label>
              <Label basic color="green">
                <Icon name="chart line" />
                Total Vested: {formatBalance(totalVested, { withSi: true })}
              </Label>
              <Label basic color="orange">
                <Icon name="history" />
                Amount Claimed Before:{' '}
                {formatBalance(amountClaimedBefore, { withSi: true })}
              </Label>
              <Label basic color="olive">
                <Icon name="unlock" />
                Amount to Unlock Now:{' '}
                {formatBalance(amountToUnlock, { withSi: true })}
              </Label>
              <Label basic color="red">
                <Icon name="lock" />
                Remaining Locked:{' '}
                {formatBalance(vestingLocked, { withSi: true })}
              </Label>
              <pre style={{ overflowX: 'auto' }}>
                {JSON.stringify(vestingInfo.toHuman(), null, 2)}
              </pre>
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
  )
}
